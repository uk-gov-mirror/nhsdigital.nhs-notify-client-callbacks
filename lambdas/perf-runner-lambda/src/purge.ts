import { PurgeQueueCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { Scenario } from "types";

export function deriveQueueUrls(
  inboundQueueUrl: string,
  scenario: Scenario,
): string[] {
  // eslint-disable-next-line sonarjs/null-dereference -- String.replace always returns a string
  const baseUrl = inboundQueueUrl.replace(/inbound-event-queue$/, "");
  const clientIds = [...new Set(scenario.eventMix.map((e) => e.clientId))];

  return [
    inboundQueueUrl,
    `${baseUrl}inbound-event-dlq`,
    ...clientIds.flatMap((id) => [
      `${baseUrl}${id}-delivery-queue`,
      `${baseUrl}${id}-delivery-dlq-queue`,
    ]),
  ];
}

export async function purgeQueues(
  client: SQSClient,
  queueUrls: string[],
): Promise<void> {
  await Promise.all(
    queueUrls.map((url) =>
      client.send(new PurgeQueueCommand({ QueueUrl: url })),
    ),
  );
}
