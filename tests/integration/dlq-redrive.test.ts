import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import {
  awaitCallbacks,
  awaitQueueEmpty,
  awaitQueueMessage,
  buildDebugLogBucketName,
  buildInboundEventQueueUrl,
  createS3Client,
  createSqsClient,
  deleteDebugLogEntries,
  getDeploymentDetails,
  getMessageStatusCallbacksFromBucket,
  listClientDlqUrls,
} from "helpers";
import { S3Client } from "@aws-sdk/client-s3";

describe("DLQ Redrive", () => {
  let sqsClient: SQSClient;
  let s3Client: S3Client;
  let dlqQueueUrls: string[];
  let dlqQueueUrl!: string;
  let inboundQueueUrl: string;
  let debugLogBucketName: string;
  let workflowTestsPassed = 0;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    sqsClient = createSqsClient();
    s3Client = createS3Client();

    inboundQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    debugLogBucketName = buildDebugLogBucketName(deploymentDetails);
    dlqQueueUrls = await listClientDlqUrls(sqsClient, deploymentDetails);
    [dlqQueueUrl] = dlqQueueUrls;

    if (dlqQueueUrls.length === 0) {
      throw new Error(
        "No per-client DLQs found. " +
          "Ensure the environment is deployed with deploy_mock_webhook=true.",
      );
    }
  });

  afterAll(async () => {
    if (workflowTestsPassed === 2) {
      await deleteDebugLogEntries(s3Client, debugLogBucketName);
    }
    sqsClient?.destroy();
    s3Client?.destroy();
  });

  describe("Infrastructure validation", () => {
    it("should discover at least one per-client DLQ", () => {
      expect(dlqQueueUrls.length).toBeGreaterThan(0);
    });

    it("should confirm the first discovered per-client DLQ is accessible", async () => {
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
      const messageId = `dlq-redrive-test-${Date.now()}`;
      const event: StatusPublishEvent<MessageStatusData> = {
        specversion: "1.0",
        id: crypto.randomUUID(),
        source: "/nhs/england/notify/development/primary/data-plane/messaging",
        subject: `customer/${crypto.randomUUID()}/message/${messageId}`,
        type: EventTypes.MESSAGE_STATUS_PUBLISHED,
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema:
          "https://notify.nhs.uk/schemas/message-status-published-v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
        data: {
          clientId: "mock-client",
          messageId,
          messageReference: `dlq-redrive-ref-${Date.now()}`,
          messageStatus: "DELIVERED",
          messageStatusDescription: "DLQ redrive integration test — delivered",
          channels: [
            {
              type: "NHSAPP",
              channelStatus: "DELIVERED",
            },
          ],
          timestamp: new Date().toISOString(),
          routingPlan: {
            id: crypto.randomUUID(),
            name: "DLQ redrive test routing plan",
            version: "v1.0.0",
            createdDate: new Date().toISOString(),
          },
        },
      };

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: dlqQueueUrl,
          MessageBody: JSON.stringify(event),
        }),
      );

      const deadMessage = await awaitQueueMessage(sqsClient, dlqQueueUrl);

      expect(deadMessage.Body).toBeDefined();
      const redrivePayload = JSON.parse(deadMessage.Body as string);
      expect(redrivePayload.data.messageId).toBe(messageId);

      const redriveTime = new Date();

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: inboundQueueUrl,
          MessageBody: deadMessage.Body!,
        }),
      );

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: dlqQueueUrl,
          ReceiptHandle: deadMessage.ReceiptHandle!,
        }),
      );

      // Poll S3 in parallel with awaitQueueEmpty — the delivery pipeline
      // (client-transform-filter → EventBridge → mock-webhook) is async, so
      // S3 entries can arrive after the inbound queue appears empty.
      const [, callbacks] = await Promise.all([
        awaitQueueEmpty(
          sqsClient,
          inboundQueueUrl,
          [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
          ],
          90_000,
        ),
        awaitCallbacks(
          () =>
            getMessageStatusCallbacksFromBucket(
              s3Client,
              debugLogBucketName,
              messageId,
              redriveTime,
            ),
          120_000,
          `MessageStatus:${messageId}`,
        ),
      ]);

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks[0]).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageStatus: "delivered",
        }),
      });
      workflowTestsPassed += 1;
    }, 180_000);

    it("should apply the same transformation logic to redriven events as original deliveries", async () => {
      const directMessageId = `direct-${Date.now()}`;
      const redriveMessageId = `redriven-${Date.now()}`;

      const directStartTime = new Date();

      const buildEvent = (
        messageId: string,
      ): StatusPublishEvent<MessageStatusData> => ({
        specversion: "1.0",
        id: crypto.randomUUID(),
        source: "/nhs/england/notify/development/primary/data-plane/messaging",
        subject: `customer/${crypto.randomUUID()}/message/${messageId}`,
        type: EventTypes.MESSAGE_STATUS_PUBLISHED,
        time: new Date().toISOString(),
        datacontenttype: "application/json",
        dataschema:
          "https://notify.nhs.uk/schemas/message-status-published-v1.json",
        traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-03",
        data: {
          clientId: "mock-client",
          messageId,
          messageReference: `ref-${messageId}`,
          messageStatus: "DELIVERED",
          messageStatusDescription: "Transformation consistency test",
          channels: [
            {
              type: "NHSAPP",
              channelStatus: "DELIVERED",
            },
          ],
          timestamp: new Date().toISOString(),
          routingPlan: {
            id: crypto.randomUUID(),
            name: "Consistency test routing plan",
            version: "v1.0.0",
            createdDate: new Date().toISOString(),
          },
        },
      });

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: inboundQueueUrl,
          MessageBody: JSON.stringify(buildEvent(directMessageId)),
        }),
      );

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: dlqQueueUrl,
          MessageBody: JSON.stringify(buildEvent(redriveMessageId)),
        }),
      );

      const dlqMessage = await awaitQueueMessage(sqsClient, dlqQueueUrl);

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.data.messageId).toBe(redriveMessageId);

      const redriveTime = new Date();

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: inboundQueueUrl,
          MessageBody: dlqMessage.Body!,
        }),
      );

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: dlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );

      // Poll S3 in parallel with awaitQueueEmpty — the delivery pipeline is
      // async so entries can arrive after the inbound queue appears empty.
      const [[directCallbacks, redriveCallbacks]] = await Promise.all([
        Promise.all([
          awaitCallbacks(
            () =>
              getMessageStatusCallbacksFromBucket(
                s3Client,
                debugLogBucketName,
                directMessageId,
                directStartTime,
              ),
            120_000,
            `MessageStatus:${directMessageId}`,
          ),
          awaitCallbacks(
            () =>
              getMessageStatusCallbacksFromBucket(
                s3Client,
                debugLogBucketName,
                redriveMessageId,
                redriveTime,
              ),
            120_000,
            `MessageStatus:${redriveMessageId}`,
          ),
        ]),
        awaitQueueEmpty(
          sqsClient,
          inboundQueueUrl,
          [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
          ],
          90_000,
        ),
      ]);

      expect(redriveCallbacks[0]).toMatchObject({
        type: directCallbacks[0].type,
        attributes: expect.objectContaining({
          messageStatus: (
            directCallbacks[0].attributes as { messageStatus?: string }
          ).messageStatus,
        }),
      });
      workflowTestsPassed += 1;
    }, 180_000);
  });
});
