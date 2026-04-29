import type { SQSRecord } from "aws-lambda";
import {
  exceedsSqsMaxVisibility,
  handleRateLimitedRecord,
  isWindowExhausted,
  jitteredBackoffSeconds,
  parseRetryAfter,
} from "services/delivery/retry-policy";
import { VisibilityManagedError } from "services/visibility-managed-error";

const mockSendToDlq = jest.fn();
jest.mock("services/dlq-sender", () => ({
  sendToDlq: (...args: unknown[]) => mockSendToDlq(...args),
}));

const mockChangeVisibility = jest.fn();
jest.mock("services/sqs-visibility", () => ({
  changeVisibility: (...args: unknown[]) => mockChangeVisibility(...args),
}));

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("jitteredBackoffSeconds", () => {
  it("produces value in [1, 5) at receiveCount=1", () => {
    for (let i = 0; i < 100; i++) {
      const val = jitteredBackoffSeconds(1);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThan(5);
    }
  });

  it("produces value in [1, 300) at receiveCount=10 (cap)", () => {
    for (let i = 0; i < 100; i++) {
      const val = jitteredBackoffSeconds(10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThan(300);
    }
  });

  it("respects cap at very high receiveCount", () => {
    for (let i = 0; i < 50; i++) {
      const val = jitteredBackoffSeconds(100);
      expect(val).toBeLessThan(300);
    }
  });
});

describe("parseRetryAfter", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("parses integer string", () => {
    expect(parseRetryAfter("120")).toBe(120);
  });

  it("returns 0 for negative values", () => {
    expect(parseRetryAfter("-5")).toBe(0);
  });

  it("parses HTTP date string", () => {
    const futureDate = new Date(10_060_000);
    expect(parseRetryAfter(futureDate.toUTCString())).toBe(60);
  });

  it("returns 0 for past HTTP date", () => {
    const pastDate = new Date(9_940_000);
    expect(parseRetryAfter(pastDate.toUTCString())).toBe(0);
  });

  it("returns 0 for garbage input", () => {
    expect(parseRetryAfter("not-a-date-or-number")).toBe(0);
  });
});

describe("isWindowExhausted", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns false just below limit", () => {
    expect(isWindowExhausted(9001, 1000)).toBe(false);
  });

  it("returns true at limit", () => {
    expect(isWindowExhausted(9000, 1000)).toBe(true);
  });

  it("returns true beyond limit", () => {
    expect(isWindowExhausted(8000, 1000)).toBe(true);
  });
});

describe("exceedsSqsMaxVisibility", () => {
  it("returns false at 43200", () => {
    expect(exceedsSqsMaxVisibility(43_200)).toBe(false);
  });

  it("returns true at 43201", () => {
    expect(exceedsSqsMaxVisibility(43_201)).toBe(true);
  });
});

const makeRecord = (overrides: Partial<SQSRecord> = {}): SQSRecord => ({
  messageId: "msg-1",
  receiptHandle: "receipt-1",
  body: JSON.stringify({
    payload: {},
    subscriptionId: "sub-1",
    targetId: "target-1",
  }),
  attributes: {
    ApproximateReceiveCount: "1",
    SentTimestamp: "0",
    SenderId: "sender",
    ApproximateFirstReceiveTimestamp: "0",
  },
  messageAttributes: {},
  md5OfBody: "abc",
  eventSource: "aws:sqs",
  eventSourceARN: "arn:aws:sqs:eu-west-2:123:queue",
  awsRegion: "eu-west-2",
  ...overrides,
});

describe("handleRateLimitedRecord", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendToDlq.mockResolvedValue(undefined);
    mockChangeVisibility.mockResolvedValue(undefined);
  });

  it("sends to DLQ and returns when Retry-After exceeds SQS max visibility", async () => {
    await handleRateLimitedRecord(
      makeRecord(),
      "client-1",
      "target-1",
      "50000",
      1,
    );

    expect(mockSendToDlq).toHaveBeenCalledWith(makeRecord().body);
    expect(mockChangeVisibility).not.toHaveBeenCalled();
  });

  it("uses Retry-After value for changeVisibility when within SQS max", async () => {
    await expect(
      handleRateLimitedRecord(makeRecord(), "client-1", "target-1", "120", 1),
    ).rejects.toThrow("Rate limited — requeue");

    expect(mockChangeVisibility).toHaveBeenCalledWith("receipt-1", 120);
    expect(mockSendToDlq).not.toHaveBeenCalled();
  });

  it("uses jittered backoff when no Retry-After header provided", async () => {
    await expect(
      handleRateLimitedRecord(
        makeRecord(),
        "client-1",
        "target-1",
        undefined,
        1,
      ),
    ).rejects.toThrow("Rate limited — requeue");

    expect(mockChangeVisibility).toHaveBeenCalled();
    const [, delaySec] = mockChangeVisibility.mock.calls[0] as [string, number];
    expect(delaySec).toBeGreaterThanOrEqual(0);
    expect(delaySec).toBeLessThan(5);
  });

  it("throws after requeuing so SQS marks the record as failed", async () => {
    await expect(
      handleRateLimitedRecord(makeRecord(), "client-1", "target-1", "30", 1),
    ).rejects.toThrow(VisibilityManagedError);
  });
});
