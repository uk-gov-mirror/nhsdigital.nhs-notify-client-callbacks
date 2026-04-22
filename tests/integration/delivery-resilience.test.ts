import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
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
import {
  awaitSignedCallbacksByCountFromWebhookLogGroup,
  countForcedStatusInvocations,
  countLogEntries,
} from "./helpers/cloudwatch";
import { createMessageStatusPublishEvent } from "./helpers/event-factories";
import {
  buildMockWebhookTargetPath,
  getClientConfig,
} from "./helpers/mock-client-config";
import { assertCallbackHeaders } from "./helpers/signature";
import {
  awaitQueueMessage,
  buildMockClientDeliveryQueueUrl,
  buildMockClientDlqQueueUrl,
  purgeQueues,
  sendSqsEvent,
} from "./helpers/sqs";

function compareStrings(a: string, b: string): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

describe("Delivery Resilience", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let callbackEventQueueUrl: string;
  let webhookLogGroupName: string;
  let startTime: number;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    startTime = Date.now();
  });

  afterAll(async () => {
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  describe("Retry & Window Exhaustion", () => {
    let retryClientDlqQueueUrl: string;
    let retryClientDeliveryQueueUrl: string;

    beforeAll(async () => {
      const deploymentDetails = getDeploymentDetails();
      const { clientId } = getClientConfig("clientShortRetry");
      retryClientDlqQueueUrl = buildMockClientDlqQueueUrl(
        deploymentDetails,
        clientId,
      );
      retryClientDeliveryQueueUrl = buildMockClientDeliveryQueueUrl(
        deploymentDetails,
        clientId,
      );
      await purgeQueues(sqsClient, [
        retryClientDlqQueueUrl,
        retryClientDeliveryQueueUrl,
      ]);
    });

    afterAll(async () => {
      await purgeQueues(sqsClient, [
        retryClientDlqQueueUrl,
        retryClientDeliveryQueueUrl,
      ]);
    });

    it("should exhaust the retry window on persistent 5xx and route to DLQ", async () => {
      const shortRetryConfig = getClientConfig("clientShortRetry");
      const messageId = `force-500-${Date.now()}`;

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            clientId: shortRetryConfig.clientId,
            messageId,
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(
        sqsClient,
        retryClientDlqQueueUrl,
        90_000,
      );

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.payload.data[0].attributes.messageId).toBe(messageId);

      const attemptCount = await countForcedStatusInvocations(
        cloudWatchClient,
        webhookLogGroupName,
        messageId,
        startTime,
        2,
      );
      expect(attemptCount).toBeGreaterThan(1);

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: retryClientDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );
    }, 180_000);

    it("should exhaust the retry window on persistent 429 and route to DLQ", async () => {
      const shortRetryConfig = getClientConfig("clientShortRetry");
      const messageId = `force-429-${Date.now()}`;

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: {
            clientId: shortRetryConfig.clientId,
            messageId,
          },
        });

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);

      const dlqMessage = await awaitQueueMessage(
        sqsClient,
        retryClientDlqQueueUrl,
        90_000,
      );

      expect(dlqMessage.Body).toBeDefined();
      const dlqPayload = JSON.parse(dlqMessage.Body as string);
      expect(dlqPayload.payload.data[0].attributes.messageId).toBe(messageId);

      const attemptCount = await countForcedStatusInvocations(
        cloudWatchClient,
        webhookLogGroupName,
        messageId,
        startTime,
        2,
      );
      expect(attemptCount).toBeGreaterThan(1);

      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: retryClientDlqQueueUrl,
          ReceiptHandle: dlqMessage.ReceiptHandle!,
        }),
      );
    }, 180_000);
  });

  describe("Rate Limiting", () => {
    const BURST_SIZE = 15;
    let rateLimitDlqQueueUrl: string;
    let rateLimitDeliveryQueueUrl: string;
    let httpsClientLogGroupName: string;

    beforeAll(async () => {
      const deploymentDetails = getDeploymentDetails();
      const { clientId } = getClientConfig("clientRateLimit");
      rateLimitDlqQueueUrl = buildMockClientDlqQueueUrl(
        deploymentDetails,
        clientId,
      );
      rateLimitDeliveryQueueUrl = buildMockClientDeliveryQueueUrl(
        deploymentDetails,
        clientId,
      );
      httpsClientLogGroupName = buildLambdaLogGroupName(
        deploymentDetails,
        `https-client-${clientId}`,
      );
      await purgeQueues(sqsClient, [
        rateLimitDlqQueueUrl,
        rateLimitDeliveryQueueUrl,
      ]);
    });

    afterAll(async () => {
      await purgeQueues(sqsClient, [
        rateLimitDlqQueueUrl,
        rateLimitDeliveryQueueUrl,
      ]);
    });

    it("should eventually deliver all events in a burst without dropping any to the DLQ", async () => {
      const rateLimitConfig = getClientConfig("clientRateLimit");
      const rateLimitTargetPath = buildMockWebhookTargetPath("clientRateLimit");

      const events = Array.from({ length: BURST_SIZE }, (_, i) =>
        createMessageStatusPublishEvent({
          data: {
            clientId: rateLimitConfig.clientId,
            messageId: `rate-limit-burst-${Date.now()}-${i}`,
          },
        }),
      );

      await Promise.all(
        events.map((event) =>
          sendSqsEvent(sqsClient, callbackEventQueueUrl, event),
        ),
      );

      const callbacks = await awaitSignedCallbacksByCountFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        events.map((e) => e.data.messageId),
        "MessageStatus",
        1,
        startTime,
      );

      const deliveredMessageIds = callbacks
        .map(
          (cb) =>
            (cb.payload.attributes as { messageId?: string }).messageId ?? "",
        )
        .toSorted(compareStrings);

      const expectedMessageIds = events
        .map((e) => e.data.messageId)
        .toSorted(compareStrings);

      expect(deliveredMessageIds).toEqual(expectedMessageIds);

      for (const callback of callbacks) {
        expect(callback.path).toBe(rateLimitTargetPath);
        assertCallbackHeaders(
          callback,
          rateLimitConfig.apiKeyVar,
          rateLimitConfig.applicationIdVar,
        );
      }

      const dlqAttributes = await sqsClient.send(
        new GetQueueAttributesCommand({
          QueueUrl: rateLimitDlqQueueUrl,
          AttributeNames: [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
          ],
        }),
      );

      const dlqMessageCount =
        Number(dlqAttributes.Attributes?.ApproximateNumberOfMessages ?? 0) +
        Number(
          dlqAttributes.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0,
        );

      expect(dlqMessageCount).toBe(0);

      const rateLimitedCount = await countLogEntries(
        cloudWatchClient,
        httpsClientLogGroupName,
        `{ $.msg = "Admission denied" && $.reason = "rate_limited" }`,
        startTime,
        1,
      );
      expect(rateLimitedCount).toBeGreaterThanOrEqual(1);
    }, 180_000);
  });
});
