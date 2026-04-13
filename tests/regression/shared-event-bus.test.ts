import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  type DeploymentDetails,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import { logger } from "@nhs-notify-client-callbacks/logger";
import {
  assertCallbackHeaders,
  awaitSignedCallbacksFromWebhookLogGroup,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createMessageStatusPublishEvent,
  ensureInboundQueueIsEmpty,
  getQueueDepth,
  getRegressionClientConfig,
  listRules,
  purgeQueues,
  putEvent,
} from "./helpers";

const NO_CALLBACK_WAIT_MS = 30_000;

describe("Shared Event Bus", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let eventBridgeClient: EventBridgeClient;
  let deploymentDetails: DeploymentDetails;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;
  let sharedBusName: string;
  let sharedBusHasRules: boolean;

  beforeAll(async () => {
    deploymentDetails = getDeploymentDetails();
    const clientConfig = getRegressionClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    eventBridgeClient = new EventBridgeClient({
      region: deploymentDetails.region,
    });
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
    sharedBusName = `${deploymentDetails.project}-${deploymentDetails.environment}-shared-event-bus`;

    try {
      const rules = await listRules(eventBridgeClient, sharedBusName);
      sharedBusHasRules = rules.length > 0;
    } catch {
      sharedBusHasRules = false;
    }

    if (!sharedBusHasRules) {
      logger.warn(
        `Shared Event Bus '${sharedBusName}' does not exist or has no routing rules — skipping Shared Event Bus tests`,
      );
    }

    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
    eventBridgeClient.destroy();
  });

  describe("Test 10.1: Full E2E via Shared Event Bus", () => {
    it("should deliver a callback when event is published to the Shared Event Bus", async () => {
      if (!sharedBusHasRules) {
        logger.warn("Skipping: Shared Event Bus rules not found");
        return;
      }

      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      await putEvent(eventBridgeClient, {
        EventBusName: sharedBusName,
        Source: event.source,
        DetailType: event.type,
        Detail: JSON.stringify(event),
      });

      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      const callbacks = await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
        webhookTargetPath,
      );

      expect(callbacks).toHaveLength(1);
      assertCallbackHeaders(callbacks[0]);
    }, 120_000);
  });

  describe("Test 10.2: Non-matching namespace event", () => {
    it("should NOT route events with a non-matching namespace to the inbound SQS queue", async () => {
      if (!sharedBusHasRules) {
        logger.warn("Skipping: Shared Event Bus rules not found");
        return;
      }

      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      await putEvent(eventBridgeClient, {
        EventBusName: sharedBusName,
        Source: "com.example.other",
        DetailType: "NonMatchingEvent",
        Detail: JSON.stringify(event),
      });

      await new Promise((resolve) => {
        setTimeout(resolve, NO_CALLBACK_WAIT_MS);
      });

      const queueDepth = await getQueueDepth(sqsClient, callbackEventQueueUrl);
      expect(queueDepth).toBe(0);
    }, 120_000);
  });
});
