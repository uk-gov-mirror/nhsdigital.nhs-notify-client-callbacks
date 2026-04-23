import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import { Logger } from "@nhs-notify-client-callbacks/logger";
import { runPerformanceTest } from "runner";
import { DEFAULT_SCENARIO } from "scenario";
import type { PerfRunnerPayload, PerformanceResult } from "types";

const logger = new Logger();

export async function handler(
  event: PerfRunnerPayload,
): Promise<PerformanceResult> {
  const { scenario = DEFAULT_SCENARIO, testId } = event;

  const region = process.env.AWS_REGION ?? "eu-west-2";
  const queueUrl = process.env.INBOUND_QUEUE_URL;
  const logGroupName = process.env.TRANSFORM_FILTER_LOG_GROUP;
  const deliveryLogGroupPrefix = process.env.DELIVERY_LOG_GROUP_PREFIX;

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

  logger.info("Performance test started", { testId });

  try {
    const result = await runPerformanceTest(
      {
        sqsClient,
        cloudWatchClient,
        queueUrl,
        logGroupName,
        deliveryLogGroupPrefix,
      },
      scenario,
      testId,
    );

    logger.info("Performance test completed", { testId });

    return result;
  } finally {
    sqsClient.destroy();
    cloudWatchClient.destroy();
  }
}
