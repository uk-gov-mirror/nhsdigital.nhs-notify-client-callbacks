import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
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
import { waitUntil } from "async-wait-until";
import {
  awaitAllEmfMetricsInLogGroup,
  awaitSignedCallbacksFromWebhookLogGroup,
  buildMockClientDlqQueueUrl,
  buildMockWebhookTargetPath,
  createMessageStatusPublishEvent,
  describeAlarms,
  ensureInboundQueueIsEmpty,
  getRegressionClientConfig,
  purgeQueues,
  queryTransformLambdaLogs,
  sendSqsEvent,
} from "./helpers";

const PII_PATTERNS = [
  /\b07\d{9}\b/,
  /\b\+?44\s?7\d{3}\s?\d{6}\b/,
  /\b[\w.-]+@[\w.-]+\.\w{2,}\b/,
  /\b\d{3}\s?\d{3}\s?\d{4}\b/,
];

describe("Observability", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let cloudWatchMetricsClient: CloudWatchClient;
  let deploymentDetails: DeploymentDetails;
  let callbackEventQueueUrl: string;
  let clientDlqQueueUrl: string;
  let transformLogGroupName: string;
  let webhookLogGroupName: string;
  let webhookTargetPath: string;

  beforeAll(async () => {
    deploymentDetails = getDeploymentDetails();
    const clientConfig = getRegressionClientConfig();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    cloudWatchMetricsClient = new CloudWatchClient({
      region: deploymentDetails.region,
    });
    callbackEventQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    clientDlqQueueUrl = buildMockClientDlqQueueUrl(
      deploymentDetails,
      clientConfig.targets,
    );
    transformLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "client-transform-filter",
    );
    webhookLogGroupName = buildLambdaLogGroupName(
      deploymentDetails,
      "mock-webhook",
    );
    webhookTargetPath = buildMockWebhookTargetPath();
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
  });

  afterAll(async () => {
    await purgeQueues(sqsClient, [callbackEventQueueUrl, clientDlqQueueUrl]);
    sqsClient.destroy();
    cloudWatchClient.destroy();
    cloudWatchMetricsClient.destroy();
  });

  describe("Test 7.1: Structured logging", () => {
    it("should emit structured log entries with required fields after processing an event", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
        webhookTargetPath,
      );

      let logEntries: Record<string, unknown>[] = [];
      await waitUntil(
        async () => {
          logEntries = await queryTransformLambdaLogs(
            cloudWatchClient,
            transformLogGroupName,
            event.data.messageId,
            startTime,
          );
          return logEntries.length > 0;
        },
        { timeout: 30_000, intervalBetweenAttempts: 2000 },
      );

      expect(logEntries.length).toBeGreaterThan(0);
      for (const entry of logEntries) {
        expect(entry).toHaveProperty("timestamp");
        expect(entry).toHaveProperty("level");
      }
    }, 120_000);
  });

  describe("Test 7.2: No PII/PHI in logs", () => {
    it("should not contain phone numbers, emails, or NHS numbers in recent transform logs", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
        webhookTargetPath,
      );

      const logEntries = await queryTransformLambdaLogs(
        cloudWatchClient,
        transformLogGroupName,
        event.data.messageId,
        startTime,
      );

      for (const entry of logEntries) {
        const entryString = JSON.stringify(entry);
        for (const pattern of PII_PATTERNS) {
          expect(entryString).not.toMatch(pattern);
        }
      }
    }, 120_000);
  });

  describe("Test 7.3: CloudWatch metrics", () => {
    it("should emit expected EMF metrics in the transform Lambda log group", async () => {
      const startTime = Date.now();
      const event: StatusPublishEvent<MessageStatusData> =
        createMessageStatusPublishEvent();

      await sendSqsEvent(sqsClient, callbackEventQueueUrl, event);
      await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

      await awaitSignedCallbacksFromWebhookLogGroup(
        cloudWatchClient,
        webhookLogGroupName,
        event.data.messageId,
        "MessageStatus",
        startTime,
        webhookTargetPath,
      );

      await awaitAllEmfMetricsInLogGroup(
        cloudWatchClient,
        transformLogGroupName,
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

  describe("Test 7.4: Anomaly detection alarm", () => {
    it("should have an anomaly detection alarm in OK state", async () => {
      const alarmPrefix = `${deploymentDetails.project}-${deploymentDetails.environment}-${deploymentDetails.component}`;
      const alarms = await describeAlarms(cloudWatchMetricsClient, alarmPrefix);

      const anomalyAlarm = alarms.find((alarm) =>
        alarm.AlarmName?.includes("inbound-event-subscriber-anomaly"),
      );

      expect(anomalyAlarm).toBeDefined();
      expect(anomalyAlarm!.StateValue).toBe("OK");
    }, 120_000);
  });
});
