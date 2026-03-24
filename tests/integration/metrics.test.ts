import { DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  awaitAllEmfMetricsInLogGroup,
  awaitQueueMessageByMessageId,
  awaitSignedCallbacksFromWebhookLogGroup,
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  buildMockClientDlqQueueUrl,
  createCloudWatchLogsClient,
  createMessageStatusPublishEvent,
  createSqsClient,
  ensureInboundQueueIsEmpty,
  getDeploymentDetails,
  purgeQueues,
  sendSqsEvent,
} from "helpers";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

describe("Metrics", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let inboundEventDlqQueueUrl: string;
  let logGroupName: string;
  let webhookLogGroupName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    clientDlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails);
    inboundEventDlqQueueUrl = buildInboundEventDlqQueueUrl(deploymentDetails);
    logGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "client-transform-filter",
    );
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );

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

  describe("Successful event processing", () => {
    it("should emit processing metrics when a valid event is fully processed", async () => {
      const startTime = Date.now();
      const event = createMessageStatusPublishEvent();

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      // Wait for signed callback log to confirm the invocation completed before checking metrics
      const callbacks = await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
      );

      expect(callbacks.length).toBeGreaterThan(0);

      await awaitAllEmfMetricsInLogGroup(
        cloudWatchClient,
        logGroupName,
        [
          "EventsReceived",
          "TransformationsSuccessful",
          "FilteringStarted",
          "FilteringMatched",
          "CallbacksInitiated",
        ],
        startTime,
      );
    }, 120_000);
  });

  describe("Validation error", () => {
    it("should emit ValidationErrors metric when an invalid event fails schema validation", async () => {
      const startTime = Date.now();
      const messageId = `invalid-schema-metrics-${Date.now()}`;
      const invalidEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            messageId,
            // @ts-expect-error - intentionally invalid: missing required channel type field
            channels: [{ channelStatus: "DELIVERED" }],
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, invalidEvent);

      // Wait for the event to land on the DLQ, confirming the Lambda ran and failed validation
      const dlqMessage = await awaitQueueMessageByMessageId(
        sqsClient,
        inboundEventDlqQueueUrl,
        messageId,
      );

      expect(dlqMessage.Body).toBeDefined();

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: inboundEventDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );

      await awaitAllEmfMetricsInLogGroup(
        cloudWatchClient,
        logGroupName,
        ["EventsReceived", "ValidationErrors"],
        startTime,
      );
    }, 120_000);
  });
});
