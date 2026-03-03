import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { waitUntil } from "async-wait-until";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { getMessageStatusCallbacks } from "helpers";

const publishEvent = async (
  client: SQSClient,
  queueUrl: string,
  event: StatusPublishEvent,
) => {
  const sendMessageCommand = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(event),
  });

  return client.send(sendMessageCommand);
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

      const sendMessageResponse = await publishEvent(
        sqsClient,
        TEST_CALLBACK_EVENT_QUEUE_URL,
        messageStatusEvent,
      );

      expect(sendMessageResponse.MessageId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_CALLBACK_EVENT_QUEUE_URL, [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
      ]);

      const callbacks = await awaitMessageStatusCallbacks(
        TEST_MOCK_WEBHOOK_LOG_GROUP,
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
  });

  describe("Channel Status Event Flow", () => {
    it("should process channel status event from SQS to webhook", async () => {
      if (!TEST_MOCK_WEBHOOK_URL) {
        return;
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
          clientId: "test-client",
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

      const sendMessageResponse = await publishEvent(
        sqsClient,
        TEST_CALLBACK_EVENT_QUEUE_URL,
        channelStatusEvent,
      );

      expect(sendMessageResponse.MessageId).toBeDefined();

      await awaitQueueEmpty(sqsClient, TEST_CALLBACK_EVENT_QUEUE_URL);
    }, 30_000);
  });
});
