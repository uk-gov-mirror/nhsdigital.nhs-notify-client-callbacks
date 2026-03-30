import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  type ChannelStatusData,
  type MessageStatusData,
  type StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  assertCallbackHeaders,
  awaitQueueMessage,
  awaitQueueMessageByMessageId,
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createChannelStatusPublishEvent,
  createCloudWatchLogsClient,
  createMessageStatusPublishEvent,
  createSqsClient,
  ensureInboundQueueIsEmpty,
  getDeploymentDetails,
  processChannelStatusEvent,
  processMessageStatusEvent,
  purgeQueues,
  sendSqsEvent,
} from "helpers";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

describe("SQS to Webhook Integration", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let inboundEventDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    clientDlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails);
    inboundEventDlqQueueUrl = buildInboundEventDlqQueueUrl(deploymentDetails);
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    webhookTargetPath = buildMockWebhookTargetPath();

    await purgeQueues(sqsClient, [
      inboundEventDlqQueueUrl,
      clientDlqQueueUrl,
      callbackEventQueueUrl,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [
      inboundEventDlqQueueUrl,
      clientDlqQueueUrl,
      callbackEventQueueUrl,
    ]);

    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Message Status Event Flow", () => {
    it("should process message status event from SQS to webhook", async () => {
      const messageStatusEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      const callbacks = await processMessageStatusEvent(
        sqsClient,
        cloudWatchClient,
        callbackEventQueueUrl,
        webhookLogGroupName,
        messageStatusEvent,
        webhookTargetPath,
      );

      expect(callbacks).toHaveLength(1);

      expect(callbacks[0].payload).toMatchObject({
        type: "MessageStatus",

        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });

      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Channel Status Event Flow", () => {
    it("should process channel status event from SQS to webhook", async () => {
      const channelStatusEvent: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent();

      const callbacks = await processChannelStatusEvent(
        sqsClient,
        cloudWatchClient,
        callbackEventQueueUrl,
        webhookLogGroupName,
        channelStatusEvent,
        webhookTargetPath,
      );

      expect(callbacks).toHaveLength(1);

      expect(callbacks[0].payload).toMatchObject({
        type: "ChannelStatus",
        attributes: expect.objectContaining({
          channel: "nhsapp",
          channelStatus: "delivered",
          supplierStatus: "delivered",
          messageId: channelStatusEvent.data.messageId,
        }),
      });

      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Client Webhook DLQ", () => {
    it("should route a non-retriable (4xx) webhook response to the per-target DLQ", async () => {
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            messageId: `force-400-${Date.now()}`,
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(sqsClient, clientDlqQueueUrl);

      expect(dlqMessage.Body).toBeDefined();
      expect(dlqMessage.MessageAttributes?.ERROR_CODE?.StringValue).toBe(
        "INVALID_PARAMETER",
      );
      expect(
        dlqMessage.MessageAttributes?.ERROR_MESSAGE?.StringValue,
      ).toContain("Forced status 400");

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: clientDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );
    }, 120_000);
  });

  describe("Inbound Event DLQ", () => {
    it("should move an invalid inbound event to the inbound-event DLQ when schema validation fails", async () => {
      const messageId = `invalid-schema-${Date.now()}`;
      const invalidEvent = createMessageStatusPublishEvent({
        data: {
          messageId,
          channels: [
            // @ts-expect-error - intentionally invalid for schema-failure DLQ path
            {
              channelStatus: "DELIVERED",
            },
          ],
        },
      });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, invalidEvent);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      const dlqMessage = await awaitQueueMessageByMessageId(
        sqsClient,
        inboundEventDlqQueueUrl,
        messageId,
      );

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.data.messageId).toBe(messageId);

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: inboundEventDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );
    }, 120_000);
  });
});
