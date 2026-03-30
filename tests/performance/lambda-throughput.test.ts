import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  buildInboundEventQueueUrl,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  buildTransformFilterLambdaLogGroupName,
  createMessageStatusPublishEvent,
  generateSqsLoad,
  waitForBatchProcessingPercentile,
} from "helpers";

const TARGET_EPS = 3000;
const LOAD_DURATION_SECONDS = 30;
const P95_LATENCY_THRESHOLD_MS = 500;

describe("Lambda throughput and latency under load", () => {
  let sqsClient: SQSClient;
  let cloudWatchClient: CloudWatchLogsClient;
  let inboundQueueUrl: string;
  let lambdaLogGroupName: string;

  beforeAll(() => {
    const deploymentDetails = getDeploymentDetails();

    sqsClient = createSqsClient(deploymentDetails);
    cloudWatchClient = createCloudWatchLogsClient(deploymentDetails);
    inboundQueueUrl = buildInboundEventQueueUrl(deploymentDetails);
    lambdaLogGroupName =
      buildTransformFilterLambdaLogGroupName(deploymentDetails);
  });

  afterAll(() => {
    sqsClient.destroy();
    cloudWatchClient.destroy();
  });

  it(`should sustain ~${TARGET_EPS} events/s for ${LOAD_DURATION_SECONDS}s with p95 Lambda processing time below ${P95_LATENCY_THRESHOLD_MS}ms`, async () => {
    const testStartTime = Date.now();

    const { durationMs, sent } = await generateSqsLoad(
      sqsClient,
      inboundQueueUrl,
      TARGET_EPS,
      LOAD_DURATION_SECONDS,
      createMessageStatusPublishEvent,
    );

    const achievedEps = Math.round(sent / (durationMs / 1000));
    console.log(
      `Load generation: ${sent} events in ${durationMs}ms (${achievedEps} eps achieved)`,
    );

    // Accept ≥90% of sent events processed — accounts for any events routed to DLQ
    // due to transient Lambda errors under concurrency pressure.
    const minExpectedCount = Math.floor(sent * 0.9);

    const { count, percentileMs } = await waitForBatchProcessingPercentile(
      cloudWatchClient,
      lambdaLogGroupName,
      testStartTime,
      minExpectedCount,
      95,
    );

    console.log(
      `Processing: ${count} events logged, p95 Lambda processing time: ${percentileMs}ms`,
    );

    expect(count).toBeGreaterThanOrEqual(minExpectedCount);
    expect(percentileMs).toBeLessThan(P95_LATENCY_THRESHOLD_MS);
  }, 600_000);
});
