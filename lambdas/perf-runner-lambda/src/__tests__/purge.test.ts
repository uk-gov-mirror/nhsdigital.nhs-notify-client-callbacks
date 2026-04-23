import type { SQSClient } from "@aws-sdk/client-sqs";
import { deriveQueueUrls, purgeQueues } from "purge";
import type { Scenario } from "types";

const scenario: Scenario = {
  phases: [{ durationSecs: 1, targetEps: 10 }],
  eventMix: [
    {
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "DELIVERED",
    },
    {
      weight: 1,
      factory: "channelStatus",
      clientId: "perf-client-2",
      channelStatus: "DELIVERED",
    },
  ],
  metricsIntervalSecs: 5,
};

const inboundQueueUrl =
  "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-inbound-event-queue";

describe("deriveQueueUrls", () => {
  it("derives all queue URLs from the inbound queue URL and scenario", () => {
    const urls = deriveQueueUrls(inboundQueueUrl, scenario);

    expect(urls).toEqual([
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-inbound-event-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-inbound-event-dlq-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-1-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-1-delivery-dlq-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-2-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-2-delivery-dlq-queue",
    ]);
  });

  it("deduplicates client IDs that appear multiple times in eventMix", () => {
    const duplicateScenario: Scenario = {
      ...scenario,
      eventMix: [
        {
          weight: 1,
          factory: "messageStatus",
          clientId: "perf-client-1",
          messageStatus: "DELIVERED",
        },
        {
          weight: 1,
          factory: "channelStatus",
          clientId: "perf-client-1",
          channelStatus: "DELIVERED",
        },
      ],
    };

    const urls = deriveQueueUrls(inboundQueueUrl, duplicateScenario);

    expect(urls).toEqual([
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-inbound-event-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-inbound-event-dlq-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-1-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-callbacks-perf-client-1-delivery-dlq-queue",
    ]);
  });
});

describe("purgeQueues", () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockSqsClient = { send: mockSend } as unknown as SQSClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it("sends a PurgeQueueCommand for each queue URL", async () => {
    const urls = [
      "https://sqs.example.invalid/queue-a",
      "https://sqs.example.invalid/queue-b",
    ];

    await purgeQueues(mockSqsClient, urls);

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("ignores NonExistentQueue errors gracefully", async () => {
    const nonExistentError = Object.assign(new Error("Queue does not exist"), {
      name: "AWS.SimpleQueueService.NonExistentQueue",
    });
    mockSend.mockRejectedValueOnce(nonExistentError);

    await expect(
      purgeQueues(mockSqsClient, ["https://sqs.example.invalid/missing"]),
    ).resolves.toBeUndefined();
  });

  it("rethrows non-NonExistentQueue errors", async () => {
    const otherError = new Error("Access denied");
    mockSend.mockRejectedValueOnce(otherError);

    await expect(
      purgeQueues(mockSqsClient, ["https://sqs.example.invalid/queue"]),
    ).rejects.toThrow("Access denied");
  });

  it("handles an empty queue URL list without sending any commands", async () => {
    await purgeQueues(mockSqsClient, []);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
