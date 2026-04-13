import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { S3Client } from "@aws-sdk/client-s3";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  buildSubscriptionConfigBucketName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  assertCallbackHeaders,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createMessageStatusPublishEvent,
  deleteObject,
  ensureInboundQueueIsEmpty,
  getQueueDepth,
  getRegressionClientConfig,
  processMessageStatusEvent,
  purgeQueues,
  putObject,
  queryCallbacksFromWebhookLogGroup,
  sendSqsEvent,
} from "./helpers";

const NO_CALLBACK_WAIT_MS = 30_000;

describe("HMAC signing", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let s3Client: S3Client;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;
  let configBucketName: string;

  beforeAll(async () => {
    const deploymentDetails = getDeploymentDetails();
    const clientConfig = getRegressionClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    s3Client = new S3Client({ region: deploymentDetails.region });
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
    configBucketName = buildSubscriptionConfigBucketName(deploymentDetails);
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
    s3Client.destroy();
  });

  describe("Test 5.1: HMAC signature correctness", () => {
    it("should produce a valid HMAC signature that matches local computation", async () => {
      const messageStatusEvent: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      const callbacks = await processMessageStatusEvent(
        sqsClient,
        cloudWatchClient,
        callbackEventQueueUrl,
        webhookLogGroupName,
        messageStatusEvent,
        webhookTargetPath,
        Date.now(),
      );

      expect(callbacks).toHaveLength(1);
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Test 5.2: Missing Applications Map entry", () => {
    const unmappedClientId = "unmapped-client";

    afterEach(async () => {
      await deleteObject(
        s3Client,
        configBucketName,
        `${unmappedClientId}.json`,
      ).catch(() => undefined);
    });

    it("should silently filter events for a client with S3 config but no SSM mapping", async () => {
      const startTime = Date.now();

      const unmappedConfig = {
        clientId: unmappedClientId,
        subscriptions: [
          {
            subscriptionId: "sub-unmapped",
            subscriptionType: "MessageStatus",
            messageStatuses: ["DELIVERED"],
            targetIds: ["target-unmapped"],
          },
        ],
        targets: [
          {
            targetId: "target-unmapped",
            type: "API",
            invocationEndpoint: "https://example.com/webhook",
            invocationMethod: "POST",
            invocationRateLimit: 10,
            apiKey: {
              headerName: "x-api-key",
              headerValue: "test-key",
            },
          },
        ],
      };

      await putObject(
        s3Client,
        configBucketName,
        `${unmappedClientId}.json`,
        JSON.stringify(unmappedConfig),
      );

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent({
          data: { clientId: unmappedClientId },
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
      expect(dlqDepth).toBe(0);
    }, 120_000);
  });
});
