import { handler } from "index";
import type { PerformanceResult } from "types";
import { DEFAULT_SCENARIO } from "scenario";

import { runPerformanceTest } from "runner";

jest.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: jest.fn(() => ({ destroy: jest.fn() })),
}));

jest.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient: jest.fn(() => ({ destroy: jest.fn() })),
}));

jest.mock("runner");
jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  Logger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockRunPerformanceTest = runPerformanceTest as jest.MockedFunction<
  typeof runPerformanceTest
>;

const mockResult: PerformanceResult = {
  testId: "test-id",
  scenario: DEFAULT_SCENARIO,
  startedAt: "2026-04-09T10:00:00.000Z",
  completedAt: "2026-04-09T10:02:00.000Z",
  phases: [],
  metrics: [],
  deliveryMetrics: [],
  circuitBreakerMetrics: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRunPerformanceTest.mockResolvedValue(mockResult);
  process.env.INBOUND_QUEUE_URL = "https://sqs.example.invalid/queue";
  process.env.TRANSFORM_FILTER_LOG_GROUP =
    "/aws/lambda/nhs-dev-callbacks-client-transform-filter";
  process.env.DELIVERY_LOG_GROUP_PREFIX =
    "/aws/lambda/nhs-dev-callbacks-https-client-";
  process.env.AWS_REGION = "eu-west-2";
});

describe("handler", () => {
  it("calls runPerformanceTest with the provided testId and scenario", async () => {
    const result = await handler({ testId: "test-id" });

    expect(result).toEqual(mockResult);
    expect(mockRunPerformanceTest).toHaveBeenCalledWith(
      expect.objectContaining({
        queueUrl: "https://sqs.example.invalid/queue",
        logGroupName: "/aws/lambda/nhs-dev-callbacks-client-transform-filter",
        deliveryLogGroupPrefix: "/aws/lambda/nhs-dev-callbacks-https-client-",
      }),
      DEFAULT_SCENARIO,
      "test-id",
    );
  });

  it("uses a custom scenario when one is provided in the event", async () => {
    const customScenario = {
      ...DEFAULT_SCENARIO,
      phases: [{ durationSecs: 5, targetEps: 500 }],
    };

    await handler({ testId: "custom-test", scenario: customScenario });

    expect(mockRunPerformanceTest).toHaveBeenCalledWith(
      expect.anything(),
      customScenario,
      "custom-test",
    );
  });

  it("destroys AWS clients even when runPerformanceTest throws", async () => {
    const { SQSClient } = jest.requireMock("@aws-sdk/client-sqs");
    const mockDestroy = jest.fn();
    SQSClient.mockReturnValue({ destroy: mockDestroy });

    mockRunPerformanceTest.mockRejectedValue(new Error("test failure"));

    await expect(handler({ testId: "failing-test" })).rejects.toThrow(
      "test failure",
    );
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("throws when INBOUND_QUEUE_URL is missing", async () => {
    delete process.env.INBOUND_QUEUE_URL;

    await expect(handler({ testId: "missing-queue-test" })).rejects.toThrow(
      "Missing required environment variable: INBOUND_QUEUE_URL",
    );
  });

  it("throws when TRANSFORM_FILTER_LOG_GROUP is missing", async () => {
    delete process.env.TRANSFORM_FILTER_LOG_GROUP;
    delete process.env.AWS_REGION;

    await expect(handler({ testId: "missing-log-group-test" })).rejects.toThrow(
      "Missing required environment variable: TRANSFORM_FILTER_LOG_GROUP",
    );
  });

  it("passes undefined deliveryLogGroupPrefix when env var is not set", async () => {
    delete process.env.DELIVERY_LOG_GROUP_PREFIX;

    await handler({ testId: "no-prefix-test" });

    expect(mockRunPerformanceTest).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryLogGroupPrefix: undefined,
      }),
      DEFAULT_SCENARIO,
      "no-prefix-test",
    );
  });
});
