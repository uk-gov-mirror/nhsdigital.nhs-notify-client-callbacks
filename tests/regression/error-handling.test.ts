import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
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
  awaitQueueMessage,
  awaitQueueMessageByMessageId,
  awaitSignedCallbacksFromWebhookLogGroup,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createMessageStatusPublishEvent,
  ensureInboundQueueIsEmpty,
  getRegressionClientConfig,
  purgeQueues,
  sendEventToDlqAndRedrive,
  sendSqsEvent,
} from "./helpers";

describe("Error handling", () => {
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

  describe("Test 4.1: Malformed event → inbound DLQ", () => {
    it("should route a malformed event to the inbound DLQ after schema validation failure", async () => {
      const messageId = `invalid-schema-regression-${Date.now()}`;
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
    }, 300_000);
  });

  // eslint-disable-next-line jest/no-disabled-tests -- @slow: 1-hour max event age with retries, excluded from PR pipeline via --testPathIgnorePatterns
  describe.skip("Test 4.2: Forced HTTP 500 → per-client DLQ (@slow)", () => {
    it("should exhaust retries and route to the per-client DLQ after persistent 500 errors", async () => {
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            messageId: `force-500-${Date.now()}`,
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(sqsClient, clientDlqQueueUrl);

      expect(dlqMessage.Body).toBeDefined();
      expect(dlqMessage.MessageAttributes?.ERROR_CODE?.StringValue).toBe(
        "SERVICE_ERROR",
      );

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: clientDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );
    }, 3_600_000);
  });

  describe("Test 4.3: DLQ redrive", () => {
    it("should successfully reprocess an event moved from the DLQ back to the inbound queue", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      const { payload: redrivePayload } = await sendEventToDlqAndRedrive(
        sqsClient,
        clientDlqQueueUrl,
        callbackEventQueueUrl,
        event,
      );

      expect(redrivePayload.id).toBe(event.id);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      const callbacks = await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
        webhookTargetPath,
      );

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks[0].payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });
});
