import { processRecords } from "handler";
import {
  DEFAULT_TARGET,
  makeRecord,
} from "__tests__/fixtures/handler-fixtures";
import { VisibilityManagedError } from "services/visibility-managed-error";

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

jest.mock("services/delivery-metrics", () => ({
  emitAdmissionDenied: jest.fn(),
  emitCircuitBreakerClosed: jest.fn(),
  emitCircuitBreakerOpen: jest.fn(),
  emitDeliveryAttempt: jest.fn(),
  emitDeliveryDuration: jest.fn(),
  emitDeliveryFailure: jest.fn(),
  emitDeliveryPermanentFailure: jest.fn(),
  emitDeliverySuccess: jest.fn(),
  emitRateLimited: jest.fn(),
  emitRetryWindowExhausted: jest.fn(),
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
      new VisibilityManagedError("Rate limited — requeue"),
    );
    mockGetRedisClient.mockResolvedValue({});
    mockAdmit.mockResolvedValue({
      allowed: true,
      probe: false,
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

  it("returns failure for 429 rate-limited responses", async () => {
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

  it("processes multiple records independently", async () => {
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
  });

  it("an unexpected error on one record does not prevent subsequent records being processed", async () => {
    const record1 = makeRecord({ messageId: "msg-1" });
    const record2 = makeRecord({ messageId: "msg-2" });

    mockLoadTargetConfig
      .mockRejectedValueOnce(new Error("S3 unavailable"))
      .mockResolvedValueOnce(DEFAULT_TARGET);

    const failures = await processRecords([record1, record2]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockDeliverPayload).toHaveBeenCalledTimes(1);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 5);
  });

  it("applies jittered backoff cooldown on unexpected errors", async () => {
    mockLoadTargetConfig.mockRejectedValue(new Error("Infrastructure error"));

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 5);
  });

  it("does not apply a second visibility change for admission-denied (managed path)", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 2000,
      effectiveRate: 10,
    });

    await processRecords([makeRecord()]);

    expect(mockChangeVisibility).toHaveBeenCalledTimes(1);
  });

  it("does not apply a second visibility change for transient failure (managed path)", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    await processRecords([makeRecord()]);

    expect(mockChangeVisibility).toHaveBeenCalledTimes(1);
  });

  it("returns failure when CLIENT_ID is not set", async () => {
    const saved = process.env.CLIENT_ID;
    delete process.env.CLIENT_ID;

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);

    process.env.CLIENT_ID = saved;
  });

  it("sends to DLQ when retry window is exhausted", async () => {
    mockIsWindowExhausted.mockReturnValue(true);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockSendToDlq).toHaveBeenCalledWith(makeRecord().body);
    expect(mockDeliverPayload).not.toHaveBeenCalled();
  });

  it("calls changeVisibility with backoff on 5xx then throws", async () => {
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

  it("requeues when rate limited by endpoint gate", async () => {
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

  it("requeues when circuit is open", async () => {
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
      expect.any(Object),
    );
    expect(mockDeliverPayload).toHaveBeenCalled();
  });

  it("calls recordResult(true) on successful delivery when CB enabled", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([]);
    expect(mockRecordResult).toHaveBeenCalledWith(
      expect.anything(),
      "target-1",
      true,
      expect.any(Object),
    );
  });

  it("calls recordResult(false) on 5xx before visibility change", async () => {
    const targetCb = {
      ...DEFAULT_TARGET,
      delivery: { circuitBreaker: { enabled: true } },
    };
    mockLoadTargetConfig.mockResolvedValue(targetCb);
    mockDeliverPayload.mockResolvedValue({
      outcome: "transient_failure",
      statusCode: 503,
    });

    const failures = await processRecords([makeRecord()]);

    expect(failures).toEqual([{ itemIdentifier: "msg-1" }]);
    expect(mockRecordResult).toHaveBeenCalledWith(
      expect.anything(),
      "target-1",
      false,
      expect.any(Object),
    );
    expect(mockChangeVisibility).toHaveBeenCalled();
  });

  it("does not call recordResult on rate-limited path", async () => {
    mockAdmit.mockResolvedValue({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 2000,
      effectiveRate: 10,
    });

    await processRecords([makeRecord()]);

    expect(mockRecordResult).not.toHaveBeenCalled();
  });

  it("does not call recordResult on 429 path", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "60",
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

  it("emits CircuitBreakerOpen metric when recordResult returns opened", async () => {
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

    const { emitCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-metrics",
    );

    await processRecords([makeRecord()]);

    expect(emitCircuitBreakerOpen).toHaveBeenCalledWith("target-1");
  });

  it("does not emit CircuitBreakerOpen when recordResult returns failed", async () => {
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

    const { emitCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-metrics",
    );

    await processRecords([makeRecord()]);

    expect(emitCircuitBreakerOpen).not.toHaveBeenCalled();
  });

  it("does not emit CircuitBreakerOpen when recordResult returns closed", async () => {
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

    const { emitCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-metrics",
    );

    await processRecords([makeRecord()]);

    expect(emitCircuitBreakerOpen).not.toHaveBeenCalled();
  });

  it("emits RateLimited metric on 429 response", async () => {
    mockDeliverPayload.mockResolvedValue({
      outcome: "rate_limited",
      retryAfterHeader: "60",
    });

    const { emitRateLimited } = jest.requireMock("services/delivery-metrics");

    await processRecords([makeRecord()]);

    expect(emitRateLimited).toHaveBeenCalledWith("target-1");
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
});
