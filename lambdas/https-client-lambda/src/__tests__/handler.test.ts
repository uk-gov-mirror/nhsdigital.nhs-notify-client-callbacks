import { processRecords } from "handler";
import {
  DEFAULT_TARGET,
  makeRecord,
} from "__tests__/fixtures/handler-fixtures";

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockLoadTargetConfig = jest.fn();
jest.mock("services/config-loader", () => ({
  loadTargetConfig: (...args: unknown[]) => mockLoadTargetConfig(...args),
}));

const mockGetApplicationId = jest.fn();
jest.mock("services/ssm-applications-map", () => ({
  getApplicationId: (...args: unknown[]) => mockGetApplicationId(...args),
}));

const mockSignPayload = jest.fn();
jest.mock("services/payload-signer", () => ({
  signPayload: (...args: unknown[]) => mockSignPayload(...args),
}));

const mockBuildAgent = jest.fn();
jest.mock("services/delivery/tls-agent-factory", () => ({
  buildAgent: (...args: unknown[]) => mockBuildAgent(...args),
}));

const mockDeliverPayload = jest.fn();
jest.mock("services/delivery/https-client", () => ({
  deliverPayload: (...args: unknown[]) => mockDeliverPayload(...args),
  OUTCOME_SUCCESS: "success",
  OUTCOME_PERMANENT_FAILURE: "permanent_failure",
  OUTCOME_RATE_LIMITED: "rate_limited",
  OUTCOME_TRANSIENT_FAILURE: "transient_failure",
}));

const mockSendToDlq = jest.fn();
jest.mock("services/dlq-sender", () => ({
  sendToDlq: (...args: unknown[]) => mockSendToDlq(...args),
}));

const mockChangeVisibility = jest.fn();
jest.mock("services/sqs-visibility", () => ({
  changeVisibility: (...args: unknown[]) => mockChangeVisibility(...args),
}));

const mockJitteredBackoff = jest.fn();
const mockIsWindowExhausted = jest.fn();
const mockHandleRateLimitedRecord = jest.fn();
jest.mock("services/delivery/retry-policy", () => ({
  jitteredBackoffSeconds: (...args: unknown[]) => mockJitteredBackoff(...args),
  isWindowExhausted: (...args: unknown[]) => mockIsWindowExhausted(...args),
  handleRateLimitedRecord: (...args: unknown[]) =>
    mockHandleRateLimitedRecord(...args),
}));

const mockAdmit = jest.fn();
const mockGetRedisClient = jest.fn();
const mockRecordResult = jest.fn();
jest.mock("services/endpoint-gate", () => ({
  admit: (...args: unknown[]) => mockAdmit(...args),
  recordResult: (...args: unknown[]) => mockRecordResult(...args),
}));
jest.mock("services/redis-client", () => ({
  getRedisClient: (...args: unknown[]) => mockGetRedisClient(...args),
}));

jest.mock("services/delivery-observability", () => ({
  recordAdmissionDenied: jest.fn(),
  recordCircuitBreakerClosed: jest.fn(),
  recordCircuitBreakerOpen: jest.fn(),
  recordDeliveryAttempt: jest.fn(),
  recordDeliveryDuration: jest.fn(),
  recordDeliveryFailure: jest.fn(),
  recordDeliveryPermanentFailure: jest.fn(),
  recordDeliveryRateLimited: jest.fn(),
  recordDeliverySuccess: jest.fn(),
  recordRetryWindowExhausted: jest.fn(),
}));

jest.mock("services/delivery-metrics", () => ({
  flushMetrics: jest.fn().mockResolvedValue(undefined),
  resetMetrics: jest.fn(),
}));

process.env.CLIENT_ID = "client-1";

describe("processRecords", () => {
  const mockAgent = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadTargetConfig.mockResolvedValue(DEFAULT_TARGET);
    mockGetApplicationId.mockResolvedValue("app-id-1");
    mockSignPayload.mockReturnValue("signature-abc");
    mockBuildAgent.mockResolvedValue(mockAgent);
    mockDeliverPayload.mockResolvedValue({ outcome: "success" });
    mockSendToDlq.mockResolvedValue(undefined);
    mockChangeVisibility.mockResolvedValue(undefined);
    mockJitteredBackoff.mockReturnValue(5);
    mockIsWindowExhausted.mockReturnValue(false);
    mockHandleRateLimitedRecord.mockRejectedValue(
      new Error("Rate limited — requeue"),
    );
    mockGetRedisClient.mockResolvedValue({});
    mockAdmit.mockResolvedValue({
      allowed: true,
      consumedTokens: 100,
      effectiveRate: 10,
    });
    mockRecordResult.mockResolvedValue({ ok: true, state: "closed" });
  });

  it("returns no failures on successful delivery", async () => {
    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockLoadTargetConfig).toHaveBeenCalledWith("client-1", "target-1");
    expect(mockGetApplicationId).toHaveBeenCalledWith("client-1");
    expect(mockSignPayload).toHaveBeenCalledWith(
      "app-id-1",
      "secret-key",
      expect.objectContaining({ data: expect.any(Array) }),
    );
    expect(mockBuildAgent).toHaveBeenCalledWith(DEFAULT_TARGET);
    expect(mockDeliverPayload).toHaveBeenCalledWith(
      DEFAULT_TARGET,
      expect.any(String),
      "signature-abc",
      mockAgent,
    );
  });

  it("sends permanent failure to DLQ and returns no failure", async () => {
    mockDeliverPayload.mockResolvedValue({ outcome: "permanent_failure" });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockSendToDlq).toHaveBeenCalledWith(makeRecord().body, {
      outcome: "permanent_failure",
    });
  });

  it("returns failure for transient 5xx errors", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
  });

  it("returns failure for 429 when handleRateLimitedRecord rejects", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "60",
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockHandleRateLimitedRecord).toHaveBeenCalledWith(
      makeRecord(),
      "client-1",
      "target-1",
      "60",
      1,
    );
  });

  it("processes multiple records in a single target batch", async () => {
    const record1 = makeRecord({ messageId: "msg-1" });
    const record2 = makeRecord({ messageId: "msg-2" });

    mockDeliverPayload
      .mockResolvedValueOnce({ outcome: "success" })
      .mockResolvedValueOnce({
        outcome: "transient_failure",
        statusCode: 500,
      });

    const failures = await processRecords([record1, record2]);

    expect(failures).toEqual([{ itemIdentifier: "msg-2" }]);
    expect(mockAdmit).toHaveBeenCalledTimes(1);
  });

  it("delivers only admitted records when consumedTokens is less than batch size", async () => {
    const record1 = makeRecord({ messageId: "msg-1" });
    const record2 = makeRecord({ messageId: "msg-2" });
    const record3 = makeRecord({ messageId: "msg-3" });

    mockAdmit.mockResolvedValue({
      allowed: true,
      consumedTokens: 1,
      effectiveRate: 10,
    });

    const failures = await processRecords([record1, record2, record3]);

    expect(mockDeliverPayload).toHaveBeenCalledTimes(1);
    expect(failures).toEqual([
      { itemIdentifier: "msg-2" },
      { itemIdentifier: "msg-3" },
    ]);
  });

  it("an unexpected delivery error does not prevent other records in the batch", async () => {
    const record1 = makeRecord({ messageId: "msg-1" });
    const record2 = makeRecord({ messageId: "msg-2" });

    mockDeliverPayload
      .mockRejectedValueOnce(new Error("Connection reset"))
      .mockResolvedValueOnce({ outcome: "success" });

    const failures = await processRecords([record1, record2]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 5);
  });

  it("applies jittered backoff cooldown on unexpected errors", async () => {
    mockDeliverPayload.mockRejectedValue(new Error("Infrastructure error"));

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 5);
  });

  it("changes visibility once per record for admission-denied batch", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 2000,
      effectiveRate: 10,
    });

    await processRecords([makeRecord()]);

    expect(mockChangeVisibility).toHaveBeenCalledTimes(1);
  });

  it("changes visibility once for transient failure", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    await processRecords([makeRecord()]);

    expect(mockChangeVisibility).toHaveBeenCalledTimes(1);
  });

  it("throws when CLIENT_ID is not set", async () => {
    const saved = process.env.CLIENT_ID;
    delete process.env.CLIENT_ID;

    await expect(processRecords([makeRecord()])).rejects.toThrow(
      "CLIENT_ID is required",
    );

    process.env.CLIENT_ID = saved;
  });

  it("sends to DLQ when retry window is exhausted", async () => {
    mockIsWindowExhausted.mockReturnValue(true);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockSendToDlq).toHaveBeenCalledWith(makeRecord().body);
    expect(mockDeliverPayload).not.toHaveBeenCalled();
  });

  it("calls changeVisibility with backoff on 5xx", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 5);
  });

  it("delegates 429 handling to handleRateLimitedRecord", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "120",
    });

    await processRecords([makeRecord()]);

    expect(mockHandleRateLimitedRecord).toHaveBeenCalledWith(
      makeRecord(),
      "client-1",
      "target-1",
      "120",
      1,
    );
  });

  it("returns no failure when handleRateLimitedRecord resolves (e.g. DLQ path)", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "99999",
    });
    mockHandleRateLimitedRecord.mockResolvedValue(undefined);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
  });

  it("requeues all records when rate limited by endpoint gate", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 2000,
      effectiveRate: 10,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 2);
    expect(mockSendToDlq).not.toHaveBeenCalled();
    expect(mockDeliverPayload).not.toHaveBeenCalled();
  });

  it("requeues all records when circuit is open", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "circuit_open",
      retryAfterMs: 30_000,
      effectiveRate: 0,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 30);
    expect(mockSendToDlq).not.toHaveBeenCalled();
    expect(mockDeliverPayload).not.toHaveBeenCalled();
  });

  it("proceeds to delivery when circuit breaker is disabled", async () => {
    const targetNoCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: false } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetNoCb);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockAdmit).toHaveBeenCalledWith(
      expect.anything(),
      "target-1",
      10,
      false,
      1,
      expect.any(Object),
    );
    expect(mockDeliverPayload).toHaveBeenCalled();
  });

  it("calls recordResult with batch counts on successful delivery when CB enabled", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockAdmit.mockResolvedValue({
      allowed: true,
      consumedTokens: 1,
      effectiveRate: 10,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockRecordResult).toHaveBeenCalledWith(
      expect.anything(),
      "target-1",
      1,
      0,
      expect.any(Object),
    );
  });

  it("calls recordResult with failure count on 5xx when CB enabled", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockAdmit.mockResolvedValue({
      allowed: true,
      consumedTokens: 1,
      effectiveRate: 10,
    });
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockRecordResult).toHaveBeenCalledWith(
      expect.anything(),
      "target-1",
      1,
      1,
      expect.any(Object),
    );
    expect(mockChangeVisibility).toHaveBeenCalled();
  });

  it("does not call recordResult on gate admission-denied path", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 2000,
      effectiveRate: 10,
    });

    await processRecords([makeRecord()]);

    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it("does not call recordResult when CB is disabled on transient failure", async () => {
    const targetNoCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: false } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetNoCb);
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    await processRecords([makeRecord()]);

    expect(mockRecordResult).not.toHaveBeenCalled();
    expect(mockChangeVisibility).toHaveBeenCalled();
  });

  it("does not call recordResult when CB is disabled on success", async () => {
    const targetNoCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: false } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetNoCb);

    await processRecords([makeRecord()]);

    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it("records CircuitBreakerOpen when recordResult returns opened", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });
    mockRecordResult.mockResolvedValue({ ok: false, state: "opened" });

    const { recordCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-observability",
    );

    await processRecords([makeRecord()]);

    expect(recordCircuitBreakerOpen).toHaveBeenCalledWith("target-1");
  });

  it("does not record CircuitBreakerOpen when recordResult returns failed", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });
    mockRecordResult.mockResolvedValue({ ok: false, state: "failed" });

    const { recordCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-observability",
    );

    await processRecords([makeRecord()]);

    expect(recordCircuitBreakerOpen).not.toHaveBeenCalled();
  });

  it("does not record CircuitBreakerOpen when recordResult returns closed", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });
    mockRecordResult.mockResolvedValue({ ok: true, state: "closed" });

    const { recordCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-observability",
    );

    await processRecords([makeRecord()]);

    expect(recordCircuitBreakerOpen).not.toHaveBeenCalled();
  });

  it("records RateLimited on 429 response", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "60",
    });

    const { recordDeliveryRateLimited } = jest.requireMock(
      "services/delivery-observability",
    );

    await processRecords([makeRecord()]);

    expect(recordDeliveryRateLimited).toHaveBeenCalledWith(
      "client-1",
      "target-1",
    );
  });

  it("uses configured maxRetryDurationSeconds when set on target", async () => {
    const targetWithRetry = {
      ...DEFAULT_TARGET,
      delivery: { ...DEFAULT_TARGET.delivery, maxRetryDurationSeconds: 3600 },
    };
    mockLoadTargetConfig.mockResolvedValue(targetWithRetry);
    mockIsWindowExhausted.mockReturnValue(false);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockIsWindowExhausted).toHaveBeenCalledWith(
      expect.any(Number),
      3_600_000,
    );
  });

  it("returns no failure when handleRateLimitedRecord resolves without throwing", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "permanent_failure",
      statusCode: 429,
      retryAfterHeader: "60",
    });
    mockHandleRateLimitedRecord.mockResolvedValueOnce(undefined);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockIsWindowExhausted).toHaveBeenCalledWith(
      expect.any(Number),
      7_200_000,
    );
  });

  it("groups records by target and processes each batch separately", async () => {
    const record1 = makeRecord({ messageId: "msg-1" });
    const record2 = makeRecord({
      messageId: "msg-2",
      body: JSON.stringify({
        payload: {
          data: [
            {
              type: "MessageStatus",
              attributes: { messageStatus: "delivered" },
            },
          ],
        },
        subscriptionId: "sub-2",
        targetId: "target-2",
      }),
    });

    const failures = await processRecords([record1, record2]);

    expect(failures).toEqual([]);
    expect(mockAdmit).toHaveBeenCalledTimes(2);
    expect(mockLoadTargetConfig).toHaveBeenCalledWith("client-1", "target-1");
    expect(mockLoadTargetConfig).toHaveBeenCalledWith("client-1", "target-2");
  });
});
