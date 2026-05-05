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
  "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-queue";

const deliveryQueueUrlPrefix =
  "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-";

describe("deriveQueueUrls", () => {
  it("derives all queue URLs from the inbound queue URL and scenario", () => {
    const urls = deriveQueueUrls(
      inboundQueueUrl,
      scenario,
      deliveryQueueUrlPrefix,
    );

    expect(urls).toEqual([
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-dlq",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-1-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-1-delivery-dlq-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-2-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-2-delivery-dlq-queue",
    ]);
  });

  it("falls back to inbound base URL when no delivery prefix provided", () => {
    const urls = deriveQueueUrls(inboundQueueUrl, scenario);

    expect(urls).toEqual([
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-dlq",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-perf-client-1-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-perf-client-1-delivery-dlq-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-perf-client-2-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-perf-client-2-delivery-dlq-queue",
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

    const urls = deriveQueueUrls(
      inboundQueueUrl,
      duplicateScenario,
      deliveryQueueUrlPrefix,
    );

    expect(urls).toEqual([
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cb-inbound-event-dlq",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-1-delivery-queue",
      "https://sqs.eu-west-2.amazonaws.com/123456789/nhs-dev-cbc-perf-client-1-delivery-dlq-queue",
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

  it("throws when a purge fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("Access denied"));

    await expect(
      purgeQueues(mockSqsClient, ["https://sqs.example.invalid/queue"]),
    ).rejects.toThrow("Access denied");
  });

  it("handles an empty queue URL list without sending any commands", async () => {
    await purgeQueues(mockSqsClient, []);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
