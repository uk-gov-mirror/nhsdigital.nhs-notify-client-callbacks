import type { DeploymentDetails } from "./deployment";

function buildQueueUrl(
  { accountId, environment, project, region }: DeploymentDetails,
  component: string,
  name: string,
  options?: { appendQueueSuffix?: boolean },
): string {
  const appendQueueSuffix = options?.appendQueueSuffix ?? true;
  const queueName = appendQueueSuffix
    ? `${project}-${environment}-${component}-${name}-queue`
    : `${project}-${environment}-${component}-${name}`;
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

export function buildInboundEventQueueUrl(
  deploymentDetails: DeploymentDetails,
): string {
  return buildQueueUrl(
    deploymentDetails,
    deploymentDetails.component,
    "inbound-event",
  );
}

export function buildInboundEventDlqQueueUrl(
  deploymentDetails: DeploymentDetails,
): string {
  return buildQueueUrl(
    deploymentDetails,
    deploymentDetails.component,
    "inbound-event-dlq",
    {
      appendQueueSuffix: false,
    },
  );
}
