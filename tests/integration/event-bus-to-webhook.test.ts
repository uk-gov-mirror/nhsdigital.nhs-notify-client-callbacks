import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { PutEventsRequestEntry } from "@aws-sdk/client-eventbridge";
import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { waitUntil } from "async-wait-until";
import type { StatusTransitionEvent } from "nhs-notify-client-transform-filter-lambda/src/models/status-transition-event";
import type { MessageStatusData } from "nhs-notify-client-transform-filter-lambda/src/models/message-status-data";

const publishEvent = async (
  client: EventBridgeClient,
  eventBusName: string,
  event: StatusTransitionEvent,
) => {
  const putEventsCommand = new PutEventsCommand({
    Entries: [
      {
        EventBusName: eventBusName,
        Source: event.source,
        DetailType: event.type,
        Detail: JSON.stringify(event),
        Time: new Date(event.time),
      } as PutEventsRequestEntry,
    ],
  });

  return client.send(putEventsCommand);
};

const getQueueMessageCount = async (
  client: SQSClient,
  queueUrl?: string,
  attributeNames: (
    | "ApproximateNumberOfMessages"
    | "ApproximateNumberOfMessagesNotVisible"
  )[] = ["ApproximateNumberOfMessages"],
) => {
  if (!queueUrl) {
    return 0;
  }

  const queueAttributesCommand = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: attributeNames,
  });

  const queueAttributes = await client.send(queueAttributesCommand);

  return Number(queueAttributes.Attributes?.ApproximateNumberOfMessages || 0);
};

const awaitQueueEmpty = async (
  client: SQSClient,
  queueUrl?: string,
  attributeNames: (
    | "ApproximateNumberOfMessages"
    | "ApproximateNumberOfMessagesNotVisible"
  )[] = ["ApproximateNumberOfMessages"],
) => {
  if (!queueUrl) {
    return;
  }

  await waitUntil(
    async () =>
      (await getQueueMessageCount(client, queueUrl, attributeNames)) === 0,
    {
      intervalBetweenAttempts: 250,
      timeout: 10_000,
    },
  );
};

const awaitMessageStatusCallbacks = async (
  logGroup: string,
  messageId: string,
) => {
  const { getMessageStatusCallbacks } = await import("./helpers/index.js");
  let callbacks: Awaited<ReturnType<typeof getMessageStatusCallbacks>> = [];

  await waitUntil(
    async () => {
      callbacks = await getMessageStatusCallbacks(logGroup, messageId);
      return callbacks.length > 0;
    },
    {
      intervalBetweenAttempts: 500,
      timeout: 10_000,
    },
  );

  if (callbacks.length === 0) {
    throw new Error("Timed out waiting for message status callbacks");
  }

  return callbacks;
};

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("Event Bus to Webhook Integration", () => {
  let eventBridgeClient: EventBridgeClient;
  let sqsClient: SQSClient;

  const TEST_EVENT_BUS_NAME =
    process.env.TEST_EVENT_BUS_NAME || "nhs-notify-shared-event-bus-dev";
  const { TEST_QUEUE_URL } = process.env;
  const { TEST_WEBHOOK_URL } = process.env;
  const { TEST_WEBHOOK_LOG_GROUP } = process.env;

  beforeAll(() => {
    eventBridgeClient = new EventBridgeClient({ region: "eu-west-2" });
    sqsClient = new SQSClient({ region: "eu-west-2" });
  });

  afterAll(() => {
    eventBridgeClient.destroy();
    sqsClient.destroy();
  });

  beforeEach(async () => {
    if (TEST_QUEUE_URL) {
      try {
        await sqsClient.send(
          new PurgeQueueCommand({
            QueueUrl: TEST_QUEUE_URL,
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.name !== "PurgeQueueInProgress") {
          throw error;
        }
      }
    }
  });

  describe("Message Status Event Flow", () => {
    it("should process message status event from Event Bus to webhook", async () => {
      if (!TEST_WEBHOOK_URL) {
        return;
      }

      if (!TEST_WEBHOOK_LOG_GROUP) {
        throw new Error("TEST_WEBHOOK_LOG_GROUP must be set for this test");
      }

      const messageStatusEvent: StatusTransitionEvent<MessageStatusData> = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source:
          "/nhs/england/notify/development/primary/data-plane/client-callbacks",
        subject: `customer/${crypto.randomUUID()}/message/test-msg-${Date.now()}`,
        type: "uk.nhs.notify.client-callbacks.message.status.transitioned.v1",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema: "https://nhs.uk/schemas/notify/message-status-data.v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
        data: {
          clientId: "test-client",
          messageId: `test-msg-${Date.now()}`,
          messageReference: `test-ref-${Date.now()}`,
          messageStatus: "DELIVERED",
          messageStatusDescription: "Integration test message delivered",
          channels: [
            {
              type: "NHSAPP",
              channelStatus: "DELIVERED",
            },
          ],
          timestamp: new Date().toISOString(),
          routingPlan: {
            id: `routing-plan-${crypto.randomUUID()}`,
            name: "Test routing plan",
            version: "v1.0.0",
            createdDate: new Date().toISOString(),
          },
        },
      };

      const putEventsResponse = await publishEvent(
        eventBridgeClient,
        TEST_EVENT_BUS_NAME,
        messageStatusEvent,
      );

      expect(putEventsResponse.FailedEntryCount).toBe(0);
      expect(putEventsResponse.Entries).toHaveLength(1);
      expect(putEventsResponse.Entries![0].EventId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_QUEUE_URL, [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
      ]);

      const callbacks = await awaitMessageStatusCallbacks(
        TEST_WEBHOOK_LOG_GROUP,
        messageStatusEvent.data.messageId,
      );

      expect(callbacks).toHaveLength(1);

      expect(callbacks[0]).toMatchObject({
        type: "MessageStatus",

        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
    }, 30_000);

    it("should filter out events not matching client subscription", async () => {
      if (!TEST_WEBHOOK_URL) {
        return;
      }

      const messageStatusEvent: StatusTransitionEvent<MessageStatusData> = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source:
          "/nhs/england/notify/development/primary/data-plane/client-callbacks",
        subject: `customer/${crypto.randomUUID()}/message/test-msg-${Date.now()}`,
        type: "uk.nhs.notify.client-callbacks.message.status.transitioned.v1",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema: "https://nhs.uk/schemas/notify/message-status-data.v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
        data: {
          clientId: "non-existent-client", // Client not in subscription config
          messageId: `test-msg-${Date.now()}`,
          messageReference: `test-ref-${Date.now()}`,
          messageStatus: "DELIVERED",
          channels: [
            {
              type: "NHSAPP",
              channelStatus: "DELIVERED",
            },
          ],
          timestamp: new Date().toISOString(),
          routingPlan: {
            id: `routing-plan-${crypto.randomUUID()}`,
            name: "Test routing plan",
            version: "v1.0.0",
            createdDate: new Date().toISOString(),
          },
        },
      };

      const putEventsResponse = await publishEvent(
        eventBridgeClient,
        TEST_EVENT_BUS_NAME,
        messageStatusEvent,
      );

      expect(putEventsResponse.FailedEntryCount).toBe(0);

      await awaitQueueEmpty(sqsClient, TEST_QUEUE_URL, [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
      ]);
    }, 30_000);
  });

  describe("Channel Status Event Flow", () => {
    it("should process channel status event from Event Bus to webhook", async () => {
      if (!TEST_WEBHOOK_URL) {
        return;
      }

      const channelStatusEvent: StatusTransitionEvent = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source:
          "/nhs/england/notify/development/primary/data-plane/client-callbacks",
        subject: `customer/${crypto.randomUUID()}/message/test-msg-${Date.now()}/channel/nhsapp`,
        type: "uk.nhs.notify.client-callbacks.channel.status.transitioned.v1",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema: "https://nhs.uk/schemas/notify/channel-status-data.v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-02",
        data: {
          clientId: "test-client",
          messageId: `test-msg-${Date.now()}`,
          messageReference: `test-ref-${Date.now()}`,
          channel: "NHSAPP",
          channelStatus: "DELIVERED",
          channelStatusDescription: "Integration test channel delivered",
          supplierStatus: "DELIVERED",
          cascadeType: "primary",
          cascadeOrder: 1,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          routingPlan: {
            id: `routing-plan-${crypto.randomUUID()}`,
            name: "Test routing plan",
            version: "v1.0.0",
            createdDate: new Date().toISOString(),
          },
        },
      };

      const putEventsResponse = await publishEvent(
        eventBridgeClient,
        TEST_EVENT_BUS_NAME,
        channelStatusEvent,
      );

      expect(putEventsResponse.FailedEntryCount).toBe(0);
      expect(putEventsResponse.Entries).toHaveLength(1);
      expect(putEventsResponse.Entries![0].EventId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_QUEUE_URL);
    }, 30_000);
  });
});
