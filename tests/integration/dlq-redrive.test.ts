import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  assertCallbackHeaders,
  awaitSignedCallbacksFromWebhookLogGroup,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createCloudWatchLogsClient,
  createMessageStatusPublishEvent,
  createSqsClient,
  ensureInboundQueueIsEmpty,
  getDeploymentDetails,
  purgeQueues,
  sendEventToDlqAndRedrive,
  sendSqsEvent,
} from "helpers";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

describe("DLQ Redrive", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let dlqQueueUrl!: string;
  let inboundQueueUrl: string;
  let webhookLogGroupName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);

    inboundQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    dlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails);
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );

    await purgeQueues(sqsClient, [inboundQueueUrl, dlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [inboundQueueUrl, dlqQueueUrl]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Infrastructure validation", () => {
    it("should confirm the target DLQ is accessible", async () => {
      const response = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: dlqQueueUrl,
          AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
        }),
      );

      expect(response.Attributes?.QueueArn).toBeDefined();
    });

    it("should confirm the inbound event queue exists and is accessible", async () => {
      const response = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: inboundQueueUrl,
          AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
        }),
      );

      expect(response.Attributes?.QueueArn).toBeDefined();
    });
  });

  describe("Redrive workflow", () => {
    it("should successfully reprocess an event moved from the DLQ back to the inbound queue", async () => {
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();
      const { payload: redrivePayload } = await sendEventToDlqAndRedrive(
        sqsClient,
        dlqQueueUrl,
        inboundQueueUrl,
        event,
      );

      expect(redrivePayload.id).toBe(event.id);
      await ensureInboundQueueIsEmpty(sqsClient, inboundQueueUrl);

      const callbacks = await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        buildMockWebhookTargetPath(),
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

    it("should apply the same transformation logic to redriven events as original deliveries", async () => {
      const directEventId = `direct-${crypto.randomUUID()}`;
      const redriveEventId = `redriven-${crypto.randomUUID()}`;

      const directEvent = createMessageStatusPublishEvent({
        event: { id: directEventId },
        data: {
          messageId: `msg-${directEventId}`,
          messageReference: `ref-${directEventId}`,
          messageStatusDescription: "Transformation consistency test",
        },
      });

      const redriveEvent = createMessageStatusPublishEvent({
        event: { id: redriveEventId },
        data: {
          messageId: `msg-${redriveEventId}`,
          messageReference: `ref-${redriveEventId}`,
          messageStatusDescription: "Transformation consistency test",
        },
      });

      await sendSqsEvent(sqsClient, inboundQueueUrl, directEvent);

      const { payload: dlqPayload } = await sendEventToDlqAndRedrive(
        sqsClient,
        dlqQueueUrl,
        inboundQueueUrl,
        redriveEvent,
      );

      expect(dlqPayload.data.messageId).toBe(redriveEvent.data.messageId);

      const [directCallbacks, redriveCallbacks] = await Promise.all([
        awaitSignedCallbacksFromWebhookLogGroup(
          cloudWatchClient,
          webhookLogGroupName,
          directEvent.data.messageId,
          "MessageStatus",
          buildMockWebhookTargetPath(),
        ),
        awaitSignedCallbacksFromWebhookLogGroup(
          cloudWatchClient,
          webhookLogGroupName,
          redriveEvent.data.messageId,
          "MessageStatus",
          buildMockWebhookTargetPath(),
        ),
      ]);

      await ensureInboundQueueIsEmpty(sqsClient, inboundQueueUrl);

      expect(redriveCallbacks[0].payload).toMatchObject({
        type: directCallbacks[0].payload.type,
        attributes: expect.objectContaining({
          messageStatus: (
            directCallbacks[0].payload.attributes as { messageStatus?: string }
          ).messageStatus,
        }),
      });
      assertCallbackHeaders(redriveCallbacks[0]);
    }, 120_000);
  });
});
