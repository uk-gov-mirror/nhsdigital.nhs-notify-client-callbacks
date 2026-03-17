import { PurgeQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  awaitCallbacks,
  awaitChannelStatusCallbacks,
  awaitQueueEmpty,
  getMessageStatusCallbacks,
  sendSqsEvent,
} from "helpers";

// eslint-disable-next-line jest/no-disabled-tests
describe.skip("SQS to Webhook Integration", () => {
  let sqsClient: SQSClient;

  const { TEST_CALLBACK_EVENT_QUEUE_URL } = process.env;
  const { TEST_MOCK_WEBHOOK_URL } = process.env;
  const { TEST_MOCK_WEBHOOK_LOG_GROUP } = process.env;
  const { REGION } = process.env;

  beforeAll(() => {
    sqsClient = new SQSClient({ region: REGION });
  });

  afterAll(() => {
    sqsClient.destroy();
  });

  beforeEach(async () => {
    if (TEST_CALLBACK_EVENT_QUEUE_URL) {
      try {
        await sqsClient.send(
          new PurgeQueueCommand({
            QueueUrl: TEST_CALLBACK_EVENT_QUEUE_URL,
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
    it("should process message status event from SQS to webhook", async () => {
      if (!TEST_MOCK_WEBHOOK_URL) {
        return;
      }

      if (!TEST_MOCK_WEBHOOK_LOG_GROUP) {
        throw new Error(
          "TEST_MOCK_WEBHOOK_LOG_GROUP must be set for this test",
        );
      }

      if (!TEST_CALLBACK_EVENT_QUEUE_URL) {
        throw new Error(
          "TEST_CALLBACK_EVENT_QUEUE_URL must be set for this test",
        );
      }

      const messageStatusEvent: StatusPublishEvent<MessageStatusData> = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source: "/nhs/england/notify/development/primary/data-plane/messaging",
        subject: `customer/${crypto.randomUUID()}/message/test-msg-${Date.now()}`,
        type: "uk.nhs.notify.message.status.PUBLISHED.v1",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema:
          "https://notify.nhs.uk/schemas/message-status-published-v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
        data: {
          clientId: "mock-client",
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

      const sendMessageResponse = await sendSqsEvent(
        sqsClient,
        TEST_CALLBACK_EVENT_QUEUE_URL,
        messageStatusEvent,
      );

      expect(sendMessageResponse.MessageId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_CALLBACK_EVENT_QUEUE_URL, [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
      ]);

      const callbacks = await awaitCallbacks(
        () =>
          getMessageStatusCallbacks(
            TEST_MOCK_WEBHOOK_LOG_GROUP,
            messageStatusEvent.data.messageId,
          ),
        10_000,
      );

      expect(callbacks).toHaveLength(1);

      expect(callbacks[0]).toMatchObject({
        type: "MessageStatus",

        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
    }, 30_000);
  });

  describe("Channel Status Event Flow", () => {
    it("should process channel status event from SQS to webhook", async () => {
      if (!TEST_MOCK_WEBHOOK_URL) {
        return;
      }

      if (!TEST_MOCK_WEBHOOK_LOG_GROUP) {
        throw new Error(
          "TEST_MOCK_WEBHOOK_LOG_GROUP must be set for this test",
        );
      }

      if (!TEST_CALLBACK_EVENT_QUEUE_URL) {
        throw new Error(
          "TEST_CALLBACK_EVENT_QUEUE_URL must be set for this test",
        );
      }

      const channelStatusEvent: StatusPublishEvent = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source: "/nhs/england/notify/development/primary/data-plane/messaging",
        subject: `customer/${crypto.randomUUID()}/message/test-msg-${Date.now()}/channel/nhsapp`,
        type: "uk.nhs.notify.channel.status.PUBLISHED.v1",
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema:
          "https://notify.nhs.uk/schemas/channel-status-published-v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-02",
        data: {
          clientId: "mock-client",
          messageId: `test-msg-${Date.now()}`,
          messageReference: `test-ref-${Date.now()}`,
          channel: "NHSAPP",
          channelStatus: "DELIVERED",
          channelStatusDescription: "Integration test channel delivered",
          supplierStatus: "delivered",
          cascadeType: "primary",
          cascadeOrder: 1,
          timestamp: new Date().toISOString(),
          retryCount: 0,
        },
      };

      const sendMessageResponse = await sendSqsEvent(
        sqsClient,
        TEST_CALLBACK_EVENT_QUEUE_URL,
        channelStatusEvent,
      );

      expect(sendMessageResponse.MessageId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_CALLBACK_EVENT_QUEUE_URL);

      const callbacks = await awaitChannelStatusCallbacks(
        TEST_MOCK_WEBHOOK_LOG_GROUP,
        channelStatusEvent.data.messageId,
      );

      expect(callbacks).toHaveLength(1);

      expect(callbacks[0]).toMatchObject({
        type: "ChannelStatus",
        attributes: expect.objectContaining({
          channel: "nhsapp",
          channelStatus: "delivered",
          supplierStatus: "delivered",
          messageId: channelStatusEvent.data.messageId,
        }),
      });
    }, 30_000);
  });
});
