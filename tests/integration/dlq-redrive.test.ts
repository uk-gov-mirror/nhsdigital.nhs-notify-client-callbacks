import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type {
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
import { assertCallbackHeaders } from "./helpers/signature";
import {
  awaitQueueMessage,
  buildMockClientDeliveryQueueUrl,
  buildMockClientDlqQueueUrl,
  ensureInboundQueueIsEmpty,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";
import {
  CLIENT_FIXTURES,
  type ClientFixtureKey,
  buildMockWebhookTargetPath,
  getClientConfig,
  getMockItClientConfig,
} from "./helpers/mock-client-config";
import {
  awaitSignedCallbacksByCountFromWebhookLogGroup,
  awaitSignedCallbacksFromWebhookLogGroup,
} from "./helpers/cloudwatch";
import { createMessageStatusPublishEvent } from "./helpers/event-factories";
import sendEventToDlqAndRedrive from "./helpers/redrive";

describe("DLQ Redrive", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let dlqQueueUrl!: string;
  let deliveryQueueUrl!: string;
  let allTargetDlqQueueUrls: string[];
  let inboundQueueUrl: string;
  let webhookLogGroupName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    const { clientId } = getMockItClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);

    inboundQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    dlqQueueUrl = buildMockClientDlqQueueUrl(deploymentDetails, clientId);
    deliveryQueueUrl = buildMockClientDeliveryQueueUrl(
      deploymentDetails,
      clientId,
    );
    allTargetDlqQueueUrls = (
      Object.keys(CLIENT_FIXTURES) as ClientFixtureKey[]
    ).map((key) =>
      buildMockClientDlqQueueUrl(
        deploymentDetails,
        getClientConfig(key).clientId,
      ),
    );
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );

    await purgeQueues(sqsClient, [
      inboundQueueUrl,
      deliveryQueueUrl,
      ...allTargetDlqQueueUrls,
    ]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [
      inboundQueueUrl,
      deliveryQueueUrl,
      ...allTargetDlqQueueUrls,
    ]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Infrastructure validation", () => {
    it("should confirm a DLQ is accessible for all configured clients", async () => {
      const responses = await Promise.all(
        allTargetDlqQueueUrls.map((queueUrl) =>
          sqsClient.send(
            new GetQueueAttributesCommand({
              QueueUrl: queueUrl,
              AttributeNames: ["QueueArn", "ApproximateNumberOfMessages"],
            }),
          ),
        ),
      );

      for (const response of responses) {
        expect(response.Attributes?.QueueArn).toBeDefined();
      }
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
      const startTime = Date.now();
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
        startTime,
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
      const startTime = Date.now();
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
          startTime,
          buildMockWebhookTargetPath(),
        ),
        awaitSignedCallbacksFromWebhookLogGroup(
          cloudWatchClient,
          webhookLogGroupName,
          redriveEvent.data.messageId,
          "MessageStatus",
          startTime,
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

  describe("Delivery DLQ redrive", () => {
    it("should redrive a 4xx-failed message from the delivery DLQ back through the delivery queue", async () => {
      const redriveStartTime = Date.now();
      const forceMessageId = `force-400-redrive-${crypto.randomUUID()}`;

      const failingEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { messageId: forceMessageId },
        });

      await sendSqsEvent(sqsClient, inboundQueueUrl, failingEvent);

      const dlqMessage = await awaitQueueMessage(
        sqsClient,
        dlqQueueUrl,
        90_000,
      );

      expect(dlqMessage.Body).toBeDefined();
      expect(dlqMessage.MessageAttributes?.ERROR_CODE?.StringValue).toBe(
        "HTTP_CLIENT_ERROR",
      );

      const dlqBody = JSON.parse(dlqMessage.Body as string) as {
        payload: { data: { attributes: { messageId: string } }[] };
        subscriptionId: string;
        targetId: string;
      };

      const redriveMessageId = `redriven-dlq-${crypto.randomUUID()}`;
      dlqBody.payload.data[0].attributes.messageId = redriveMessageId;

      await sendSqsEvent(sqsClient, deliveryQueueUrl, dlqBody);

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: dlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );

      const callbacks = await awaitSignedCallbacksByCountFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        redriveMessageId,
        "MessageStatus",
        1,
        redriveStartTime,
      );

      expect(callbacks).toHaveLength(1);
      expect(callbacks[0].payload).toMatchObject({
        type: "MessageStatus",
        attributes: expect.objectContaining({
          messageId: redriveMessageId,
          messageStatus: "delivered",
        }),
      });
      assertCallbackHeaders(callbacks[0]);
    }, 180_000);
  });
});
