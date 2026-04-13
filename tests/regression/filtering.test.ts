import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import { logger } from "@nhs-notify-client-callbacks/logger";
import {
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createChannelStatusPublishEvent,
  createMessageStatusPublishEvent,
  ensureInboundQueueIsEmpty,
  getQueueDepth,
  getRegressionClientConfig,
  processChannelStatusEvent,
  purgeQueues,
  queryCallbacksFromWebhookLogGroup,
  sendSqsEvent,
} from "./helpers";

const NO_CALLBACK_WAIT_MS = 30_000;

describe("Filtering", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let inboundEventDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;

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
    inboundEventDlqQueueUrl = buildInboundEventDlqQueueUrl(deploymentDetails);
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    webhookTargetPath = buildMockWebhookTargetPath();
    await purgeQueues(sqsClient, [
      callbackEventQueueUrl,
      clientDlqQueueUrl,
      inboundEventDlqQueueUrl,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [
      callbackEventQueueUrl,
      clientDlqQueueUrl,
      inboundEventDlqQueueUrl,
    ]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Test 3.1: No status transition", () => {
    it("should NOT deliver a callback when previousMessageStatus equals messageStatus", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            messageStatus: "DELIVERED",
            previousMessageStatus: "DELIVERED",
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      // Wait a bounded period, then confirm no callback was delivered
      await new Promise((resolve) => {
        setTimeout(resolve, NO_CALLBACK_WAIT_MS);
      });

      const callbacks = await queryCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
      );

      expect(callbacks).toHaveLength(0);

      // Verify no DLQ entries either
      const dlqDepth = await getQueueDepth(sqsClient, clientDlqQueueUrl);
      const inboundDlqDepth = await getQueueDepth(
        sqsClient,
        inboundEventDlqQueueUrl,
      );
      expect(dlqDepth).toBe(0);
      expect(inboundDlqDepth).toBe(0);

      logger.info(
        `Filtering test 3.1: Confirmed no callback delivered for messageId=${event.data.messageId} (waited ${NO_CALLBACK_WAIT_MS}ms)`,
      );
    }, 120_000);
  });

  describe("Test 3.2: Unsubscribed channel type (LETTER)", () => {
    it("should NOT deliver a callback for an unsubscribed channel type", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent({
          data: {
            channel: "LETTER",
            channelStatus: "DELIVERED",
            supplierStatus: "delivered",
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      await new Promise((resolve) => {
        setTimeout(resolve, NO_CALLBACK_WAIT_MS);
      });

      const callbacks = await queryCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "ChannelStatus",
        startTime,
      );

      expect(callbacks).toHaveLength(0);

      logger.info(
        `Filtering test 3.2: Confirmed no callback delivered for LETTER channel (messageId=${event.data.messageId})`,
      );
    }, 120_000);
  });

  describe("Test 3.3: Unknown client", () => {
    it("should silently discard events from an unknown client", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            clientId: "nonexistent-client",
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      await new Promise((resolve) => {
        setTimeout(resolve, NO_CALLBACK_WAIT_MS);
      });

      const callbacks = await queryCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
      );

      expect(callbacks).toHaveLength(0);

      const dlqDepth = await getQueueDepth(sqsClient, clientDlqQueueUrl);
      const inboundDlqDepth = await getQueueDepth(
        sqsClient,
        inboundEventDlqQueueUrl,
      );
      expect(dlqDepth).toBe(0);
      expect(inboundDlqDepth).toBe(0);

      logger.info(
        `Filtering test 3.3: Confirmed unknown client event silently discarded (messageId=${event.data.messageId})`,
      );
    }, 120_000);
  });

  describe("Test 3.4: SupplierStatus transition", () => {
    it("should deliver a callback when supplierStatus changed but channelStatus did not", async () => {
      const event: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent({
          data: {
            channel: "NHSAPP",
            channelStatus: "DELIVERED",
            supplierStatus: "read",
            previousChannelStatus: "DELIVERED",
            previousSupplierStatus: "delivered",
          },
        });

      const callbacks = await processChannelStatusEvent(
        sqsClient,
        cloudWatchClient,
        callbackEventQueueUrl,
        webhookLogGroupName,
        event,
        webhookTargetPath,
        Date.now(),
      );

      expect(callbacks).toHaveLength(1);
      expect(callbacks[0].payload).toMatchObject({
        type: "ChannelStatus",
        attributes: expect.objectContaining({
          supplierStatus: "read",
          messageId: event.data.messageId,
        }),
      });
    }, 120_000);
  });
});
