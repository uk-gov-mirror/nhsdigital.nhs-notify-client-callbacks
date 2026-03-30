import type { DeploymentDetails } from "./deployment";

function buildQueueUrl(
  { accountId, component, environment, project, region }: DeploymentDetails,
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
  return buildQueueUrl(deploymentDetails, "inbound-event");
}

export function buildInboundEventDlqQueueUrl(
  deploymentDetails: DeploymentDetails,
): string {
  return buildQueueUrl(deploymentDetails, "inbound-event-dlq", {
    appendQueueSuffix: false,
  });
}
