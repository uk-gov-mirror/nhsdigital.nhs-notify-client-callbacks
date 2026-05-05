import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { DeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  buildInboundEventDlqQueueUrl,
  buildInboundEventQueueUrl,
  buildLambdaLogGroupName,
  createCloudWatchLogsClient,
  createSqsClient,
  getDeploymentDetails,
} from "@nhs-notify-client-callbacks/test-support/helpers";
import {
  buildMockClientDeliveryQueueUrl,
  buildMockClientDlqQueueUrl,
} from "./sqs";

export type TestContext = {
  sqs: SQSClient;
  cwLogs: CloudWatchLogsClient;
  deployment: DeploymentDetails;
  inboundQueueUrl: string;
  inboundDlqUrl: string;
  webhookLogGroup: string;
  startTime: number;
  clientDlqUrl(clientId: string): string;
  clientDeliveryUrl(clientId: string): string;
  logGroup(name: string): string;
  clientLogGroup(name: string): string;
};

export function createTestContext(): TestContext {
  const deployment = getDeploymentDetails();

  return {
    sqs: createSqsClient(deployment),
    cwLogs: createCloudWatchLogsClient(deployment),
    deployment,
    inboundQueueUrl: buildInboundEventQueueUrl(deployment),
    inboundDlqUrl: buildInboundEventDlqQueueUrl(deployment),
    webhookLogGroup: buildLambdaLogGroupName(deployment, "mock-webhook"),
    startTime: Date.now(),
    clientDlqUrl: (clientId) =>
      buildMockClientDlqQueueUrl(deployment, clientId),
    clientDeliveryUrl: (clientId) =>
      buildMockClientDeliveryQueueUrl(deployment, clientId),
    logGroup: (name) => buildLambdaLogGroupName(deployment, name),
    clientLogGroup: (name) =>
      `/aws/lambda/${deployment.project}-${deployment.environment}-${deployment.clientComponent}-${name}`,
  };
}

export function destroyTestContext(ctx: TestContext): void {
  ctx.sqs.destroy();
  ctx.cwLogs.destroy();
}
