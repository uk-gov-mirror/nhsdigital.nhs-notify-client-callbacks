import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  assertCallbackHeaders,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createChannelStatusPublishEvent,
  createMessageStatusPublishEvent,
  getRegressionClientConfig,
  processChannelStatusEvent,
  processMessageStatusEvent,
  purgeQueues,
} from "./helpers";

describe("Happy path", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;
  let startTime: number;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    const clientConfig = getRegressionClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    clientDlqQueueUrl = buildMockClientDlqQueueUrl(
      deploymentDetails,
      clientConfig.targets,
    );
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    webhookTargetPath = buildMockWebhookTargetPath();
    startTime = Date.now();
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Test 2.1: Message Status E2E", () => {
    it("should deliver a callback with correct format, lowercased status, and valid HMAC signature", async () => {
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
          messageId: messageStatusEvent.data.messageId,
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Test 2.2: Channel Status E2E (NHSAPP)", () => {
    it("should deliver a ChannelStatus callback with channel, channelStatus, supplierStatus, cascadeType, cascadeOrder, retryCount", async () => {
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
          cascadeType: "primary",
          cascadeOrder: 1,
          retryCount: 0,
          messageId: channelStatusEvent.data.messageId,
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Test 2.3: SMS Channel Status", () => {
    it("should match the SMS channel subscription and deliver a callback with channel sms", async () => {
      const smsChannelEvent: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent({
          event: {
            subject: `customer/${crypto.randomUUID()}/message/${crypto.randomUUID()}/channel/sms`,
          },
          data: {
            channel: "SMS",
            channelStatus: "DELIVERED",
            supplierStatus: "delivered",
          },
        });

      const callbacks = await processChannelStatusEvent(
        sqsClient,
        cloudWatchClient,
        callbackEventQueueUrl,
        webhookLogGroupName,
        smsChannelEvent,
        webhookTargetPath,
        startTime,
      );

      expect(callbacks).toHaveLength(1);
      expect(callbacks[0].payload).toMatchObject({
        type: "ChannelStatus",
        attributes: expect.objectContaining({
          channel: "sms",
          messageId: smsChannelEvent.data.messageId,
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });
});
