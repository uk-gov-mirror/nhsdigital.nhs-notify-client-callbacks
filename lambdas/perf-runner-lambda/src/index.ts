import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { Logger } from "@nhs-notify-client-callbacks/logger";
import { runPerformanceTest } from "runner";
import type {
  ElastiCacheDeps,
  PerfRunnerPayload,
  PerformanceResult,
} from "types";

const logger = new Logger();

export async function handler(
  event: PerfRunnerPayload,
): Promise<PerformanceResult> {
  const { cloudWatchSettlingMs, scenario, skipPurge, testId } = event;

  const region = process.env.AWS_REGION ?? "eu-west-2";
  const queueUrl = process.env.INBOUND_QUEUE_URL;
  const deliveryQueueUrlPrefix = process.env.DELIVERY_QUEUE_URL_PREFIX;
  const logGroupName = process.env.TRANSFORM_FILTER_LOG_GROUP;
  const deliveryLogGroupPrefix = process.env.DELIVERY_LOG_GROUP_PREFIX;
  const mockWebhookLogGroup = process.env.MOCK_WEBHOOK_LOG_GROUP;
  const elasticacheEndpoint = process.env.ELASTICACHE_ENDPOINT;
  const elasticacheCacheName = process.env.ELASTICACHE_CACHE_NAME;
  const elasticacheIamUsername = process.env.ELASTICACHE_IAM_USERNAME;

  if (!queueUrl) {
    throw new Error("Missing required environment variable: INBOUND_QUEUE_URL");
  }

  if (!logGroupName) {
    throw new Error(
      "Missing required environment variable: TRANSFORM_FILTER_LOG_GROUP",
    );
  }

  const sqsClient = new SQSClient({ region });
  const cloudWatchClient = new CloudWatchLogsClient({ region });

  const elastiCacheDeps: ElastiCacheDeps | undefined =
    elasticacheEndpoint && elasticacheCacheName && elasticacheIamUsername
      ? {
          endpoint: elasticacheEndpoint,
          cacheName: elasticacheCacheName,
          iamUsername: elasticacheIamUsername,
          region,
        }
      : undefined;

  logger.info("Performance test started", { testId });

  try {
    const result = await runPerformanceTest(
      {
        sqsClient,
        cloudWatchClient,
        queueUrl,
        deliveryQueueUrlPrefix,
        logGroupName,
        deliveryLogGroupPrefix,
        mockWebhookLogGroup,
      },
      scenario,
      testId,
      undefined,
      elastiCacheDeps,
      cloudWatchSettlingMs,
      skipPurge,
    );

    logger.info("Performance test completed", { testId });

    return result;
  } finally {
    sqsClient.destroy();
    cloudWatchClient.destroy();
  }
}
