import { PurgeQueueCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { Scenario } from "types";

export function deriveQueueUrls(
  inboundQueueUrl: string,
  scenario: Scenario,
  deliveryQueueUrlPrefix?: string,
): string[] {
  // eslint-disable-next-line sonarjs/null-dereference -- String.replace always returns a string
  const inboundBase = inboundQueueUrl.replace(/inbound-event-queue$/, "");
  const deliveryBase = deliveryQueueUrlPrefix ?? inboundBase;
  const clientIds = [...new Set(scenario.eventMix.map((e) => e.clientId))];

  return [
    inboundQueueUrl,
    `${inboundBase}inbound-event-dlq-queue`,
    ...clientIds.flatMap((id) => [
      `${deliveryBase}${id}-delivery-queue`,
      `${deliveryBase}${id}-delivery-dlq-queue`,
    ]),
  ];
}

export async function purgeQueues(
  client: SQSClient,
  queueUrls: string[],
): Promise<void> {
  const results = await Promise.allSettled(
    queueUrls.map((url) =>
      client.send(new PurgeQueueCommand({ QueueUrl: url })),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      const error = result.reason as { name?: string };
      if (error.name !== "QueueDoesNotExist") {
        throw result.reason as Error;
      }
    }
  }
}
