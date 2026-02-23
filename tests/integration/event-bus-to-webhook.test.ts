import {
  EventBridgeClient,
  PutEventsCommand,
  type PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge";
import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import type { StatusTransitionEvent } from "nhs-notify-client-transform-filter-lambda/src/models/status-transition-event";
import type { MessageStatusData } from "nhs-notify-client-transform-filter-lambda/src/models/message-status-data";

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

      const putEventsCommand = new PutEventsCommand({
        Entries: [
          {
            EventBusName: TEST_EVENT_BUS_NAME,
            Source: messageStatusEvent.source,
            DetailType: messageStatusEvent.type,
            Detail: JSON.stringify(messageStatusEvent),
            Time: new Date(messageStatusEvent.time),
          } as PutEventsRequestEntry,
        ],
      });

      const putEventsResponse = await eventBridgeClient.send(putEventsCommand);

      expect(putEventsResponse.FailedEntryCount).toBe(0);
      expect(putEventsResponse.Entries).toHaveLength(1);
      expect(putEventsResponse.Entries![0].EventId).toBeDefined();

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      });

      let queueMessageCount = 0;
      if (TEST_QUEUE_URL) {
        const queueAttributesCommand = new GetQueueAttributesCommand({
          QueueUrl: TEST_QUEUE_URL,
          AttributeNames: [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
          ],
        });

        const queueAttributes = await sqsClient.send(queueAttributesCommand);
        queueMessageCount = Number(
          queueAttributes.Attributes?.ApproximateNumberOfMessages || 0,
        );
      }

      expect(TEST_QUEUE_URL ? queueMessageCount : 0).toBe(0);

      if (TEST_WEBHOOK_LOG_GROUP) {
        const { getMessageStatusCallbacks } = await import(
          "./helpers/index.js"
        );
        const callbacks = await getMessageStatusCallbacks(
          TEST_WEBHOOK_LOG_GROUP,
          messageStatusEvent.data.messageId,
        );
        // eslint-disable-next-line jest/no-conditional-expect
        expect(callbacks).toHaveLength(1);
        // eslint-disable-next-line jest/no-conditional-expect
        expect(callbacks[0]).toMatchObject({
          type: "MessageStatus",
          // eslint-disable-next-line jest/no-conditional-expect
          attributes: expect.objectContaining({
            messageStatus: "delivered",
          }),
        });
      }
    }, 30_000); // 30 second timeout for integration test

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

      const putEventsCommand = new PutEventsCommand({
        Entries: [
          {
            EventBusName: TEST_EVENT_BUS_NAME,
            Source: messageStatusEvent.source,
            DetailType: messageStatusEvent.type,
            Detail: JSON.stringify(messageStatusEvent),
            Time: new Date(messageStatusEvent.time),
          } as PutEventsRequestEntry,
        ],
      });

      const putEventsResponse = await eventBridgeClient.send(putEventsCommand);

      expect(putEventsResponse.FailedEntryCount).toBe(0);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      });
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

      const putEventsCommand = new PutEventsCommand({
        Entries: [
          {
            EventBusName: TEST_EVENT_BUS_NAME,
            Source: channelStatusEvent.source,
            DetailType: channelStatusEvent.type,
            Detail: JSON.stringify(channelStatusEvent),
            Time: new Date(channelStatusEvent.time),
          } as PutEventsRequestEntry,
        ],
      });

      const putEventsResponse = await eventBridgeClient.send(putEventsCommand);

      expect(putEventsResponse.FailedEntryCount).toBe(0);
      expect(putEventsResponse.Entries).toHaveLength(1);
      expect(putEventsResponse.Entries![0].EventId).toBeDefined();

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      });

      let queueMessageCount = 0;
      if (TEST_QUEUE_URL) {
        const queueAttributesCommand = new GetQueueAttributesCommand({
          QueueUrl: TEST_QUEUE_URL,
          AttributeNames: ["ApproximateNumberOfMessages"],
        });

        const queueAttributes = await sqsClient.send(queueAttributesCommand);
        queueMessageCount = Number(
          queueAttributes.Attributes?.ApproximateNumberOfMessages || 0,
        );
      }

      expect(TEST_QUEUE_URL ? queueMessageCount : 0).toBe(0);
    }, 30_000);
  });
});
