import { type SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import type { StatusPublishEvent } from "@nhs-notify-client-callbacks/models";
import type { EventMixEntry, Phase, PhaseResult } from "types";
import { createEvent } from "event-factories";

const SQS_MAX_BATCH_SIZE = 10;

export function selectWeighted<T extends { weight: number }>(entries: T[]): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  // eslint-disable-next-line sonarjs/pseudo-random -- weighted selection for load test event distribution
  let remaining = Math.random() * totalWeight;

  for (const entry of entries.slice(0, -1)) {
    remaining -= entry.weight;
    if (remaining <= 0) return entry;
  }

  // Safe: selectWeighted is only called with non-empty arrays
  return entries.at(-1)!;
}

export async function sendSqsBatch(
  client: SQSClient,
  queueUrl: string,
  events: StatusPublishEvent[],
): Promise<void> {
  await client.send(
    new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: events.map((event, index) => ({
        Id: String(index),
        MessageBody: JSON.stringify(event),
      })),
    }),
  );
}

export async function generatePhaseLoad(
  client: SQSClient,
  queueUrl: string,
  phase: Phase,
  eventMix: EventMixEntry[],
): Promise<PhaseResult> {
  const batchesPerSecond = Math.ceil(phase.targetEps / SQS_MAX_BATCH_SIZE);
  const start = Date.now();
  let sent = 0;

  for (let second = 0; second < phase.durationSecs; second++) {
    const waveStart = Date.now();

    const batchResults = await Promise.all(
      Array.from({ length: batchesPerSecond }, () => {
        const batch = Array.from({ length: SQS_MAX_BATCH_SIZE }, () =>
          createEvent(selectWeighted(eventMix)),
        );
        return sendSqsBatch(client, queueUrl, batch).then(() => batch.length);
      }),
    );

    sent += batchResults.reduce((sum, count) => sum + count, 0);

    const remaining = 1000 - (Date.now() - waveStart);
    if (remaining > 0 && second < phase.durationSecs - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, remaining);
      });
    }
  }

  const durationMs = Date.now() - start;

  return {
    targetEps: phase.targetEps,
    achievedEps: Math.round(sent / (durationMs / 1000)),
    sent,
    durationMs,
  };
}
