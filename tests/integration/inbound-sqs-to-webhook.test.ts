import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  type ChannelStatusData,
  type MessageStatusData,
  type StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import { awaitSignedCallbacksByCountFromWebhookLogGroup } from "./helpers/cloudwatch";
import {
  createChannelStatusPublishEvent,
  createMessageStatusPublishEvent,
} from "./helpers/event-factories";
import {
  buildMockWebhookTargetPath,
  buildMockWebhookTargetPaths,
  getMockItClient2Config,
  getMockItClientConfig,
} from "./helpers/mock-client-config";
import { assertCallbackHeaders } from "./helpers/signature";
import {
  awaitQueueMessage,
  awaitQueueMessageByMessageId,
  buildMockClientDlqQueueUrl,
  ensureInboundQueueIsEmpty,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";
import {
  processChannelStatusEvent,
  processMessageStatusEvent,
} from "./helpers/status-events";

describe("SQS to Webhook Integration", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let inboundEventDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;
  let startTime: number;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    const { targets } = getMockItClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    clientDlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails, targets);
    inboundEventDlqQueueUrl = buildInboundEventDlqQueueUrl(deploymentDetails);
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    webhookTargetPath = buildMockWebhookTargetPath();
    startTime = Date.now();
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
        startTime,
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

    it("should fan out a message status event to subscription with multiple target endpoints", async () => {
      const client2Config = getMockItClient2Config();
      const expectedPaths = buildMockWebhookTargetPaths("client2");

      const messageStatusEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            clientId: client2Config.clientId,
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, messageStatusEvent);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      const callbacks = await awaitSignedCallbacksByCountFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        messageStatusEvent.data.messageId,
        "MessageStatus",
        expectedPaths.length,
        startTime,
      );

      expect(callbacks).toHaveLength(expectedPaths.length);

      const actualPaths = callbacks
        .map((callback) => callback.path)
        .toSorted((a, b) => a.localeCompare(b));
      expect(actualPaths).toEqual(
        expectedPaths.toSorted((a, b) => a.localeCompare(b)),
      );

      for (const callback of callbacks) {
        expect(callback.payload).toMatchObject({
          type: "MessageStatus",
          attributes: expect.objectContaining({
            messageId: messageStatusEvent.data.messageId,
            messageStatus: "delivered",
          }),
        });

        assertCallbackHeaders(
          callback,
          client2Config.apiKeyVar,
          client2Config.applicationIdVar,
        );
      }
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
        startTime,
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
