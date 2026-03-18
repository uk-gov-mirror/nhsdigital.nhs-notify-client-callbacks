import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  awaitCallbacksFromBucketByKey,
  buildDebugLogBucketName,
  buildInboundEventQueueUrl,
  buildMockClientDlqQueueUrl,
  createMessageStatusPublishEvent,
  createS3Client,
  createSqsClient,
  ensureInboundQueueIsEmpty,
  getDeploymentDetails,
  purgeQueues,
  sendEventToDlqAndRedrive,
  sendSqsEvent,
} from "helpers";
import { S3Client } from "@aws-sdk/client-s3";

describe("DLQ Redrive", () => {
  let sqsClient: SQSClient;
  let s3Client: S3Client;
  let dlqQueueUrl!: string;
  let inboundQueueUrl: string;
  let debugLogBucketName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    s3Client = createS3Client(deploymentDetails);

    inboundQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    dlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails);
    debugLogBucketName = buildDebugLogBucketName(deploymentDetails);

    await purgeQueues(sqsClient, [inboundQueueUrl, dlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [inboundQueueUrl, dlqQueueUrl]);
    sqsClient.destroy();
    s3Client.destroy();
  });

  describe("Infrastructure validation", () => {
    it("should confirm the mock-client DLQ is accessible", async () => {
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

      const callbacks = await awaitCallbacksFromBucketByKey(
        s3Client,
        debugLogBucketName,
        event.id,
        "MessageStatus",
      );

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks[0]).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
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

      const directCallbacks = await awaitCallbacksFromBucketByKey(
        s3Client,
        debugLogBucketName,
        directEventId,
        "MessageStatus",
      );

      const redriveCallbacks = await awaitCallbacksFromBucketByKey(
        s3Client,
        debugLogBucketName,
        redriveEventId,
        "MessageStatus",
      );

      await ensureInboundQueueIsEmpty(sqsClient, inboundQueueUrl);

      expect(redriveCallbacks[0]).toMatchObject({
        type: directCallbacks[0].type,
        attributes: expect.objectContaining({
          messageStatus: (
            directCallbacks[0].attributes as { messageStatus?: string }
          ).messageStatus,
        }),
      });
    }, 120_000);
  });
});
