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
import {
  assertCallbackHeaders,
  awaitSignedCallbacksByCountFromWebhookLogGroup,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createChannelStatusPublishEvent,
  createMessageStatusPublishEvent,
  ensureInboundQueueIsEmpty,
  getQueueDepth,
  getRegressionClientConfig,
  processChannelStatusEvent,
  purgeQueues,
  sendSqsEvent,
} from "./helpers";

describe("Resilience", () => {
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

  describe("Test 9.1: Batch processing", () => {
    it("should process 10 events rapidly and deliver all 10 callbacks", async () => {
      const startTime = Date.now();
      const batchSize = 10;
      const sharedMessageId = `batch-${crypto.randomUUID()}`;

      const events: StatusPublishEvent<MessageStatusData>[] = Array.from(
        { length: batchSize },
        (_, index) =>
          createMessageStatusPublishEvent({
            data: {
              messageId: `${sharedMessageId}-${String(index)}`,
            },
          }),
      );

      await Promise.all(
        events.map((event) =>
          sendSqsEvent(sqsClient, callbackEventQueueUrl, event),
        ),
      );

      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      const allCallbacks = await Promise.all(
        events.map((event) =>
          awaitSignedCallbacksByCountFromWebhookLogGroup(
            cloudWatchClient,
            webhookLogGroupName,
            event.data.messageId,
            "MessageStatus",
            1,
            startTime,
          ),
        ),
      );

      expect(allCallbacks.flat()).toHaveLength(batchSize);

      for (const callbacks of allCallbacks) {
        expect(callbacks).toHaveLength(1);
        assertCallbackHeaders(callbacks[0]);
      }

      const dlqDepth = await getQueueDepth(sqsClient, clientDlqQueueUrl);
      const inboundDlqDepth = await getQueueDepth(
        sqsClient,
        inboundEventDlqQueueUrl,
      );
      expect(dlqDepth).toBe(0);
      expect(inboundDlqDepth).toBe(0);
    }, 180_000);
  });

  describe("Test 9.2: Optional fields missing", () => {
    it("should process a channel status event without optional fields", async () => {
      const event: StatusPublishEvent<ChannelStatusData> =
        createChannelStatusPublishEvent({
          data: {
            channelStatusDescription: undefined,
            channelFailureReasonCode: undefined,
          },
          event: {
            sequence: undefined,
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
          messageId: event.data.messageId,
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 180_000);
  });
});
