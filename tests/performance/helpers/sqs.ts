import {
  SQSClient,
  SendMessageBatchCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type { StatusPublishEvent } from "@nhs-notify-client-callbacks/models";

export async function sendSqsEvent(
  client: SQSClient,
  queueUrl: string,
  event: StatusPublishEvent,
): Promise<void> {
  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    }),
  );
}

const SQS_MAX_BATCH_SIZE = 10;

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

export async function generateSqsLoad(
  client: SQSClient,
  queueUrl: string,
  targetEventsPerSecond: number,
  durationSeconds: number,
  eventFactory: () => StatusPublishEvent,
): Promise<{ sent: number; durationMs: number }> {
  const batchesPerSecond = Math.ceil(
    targetEventsPerSecond / SQS_MAX_BATCH_SIZE,
  );
  const start = Date.now();
  let sent = 0;

  for (let second = 0; second < durationSeconds; second++) {
    const waveStart = Date.now();

    const results = await Promise.all(
      Array.from({ length: batchesPerSecond }, () => {
        const batch = Array.from({ length: SQS_MAX_BATCH_SIZE }, eventFactory);
        return sendSqsBatch(client, queueUrl, batch).then(() => batch.length);
      }),
    );
    sent += results.reduce((sum, count) => sum + count, 0);

    const remaining = 1000 - (Date.now() - waveStart);
    if (remaining > 0 && second < durationSeconds - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, remaining);
      });
    }
  }

  return { sent, durationMs: Date.now() - start };
}
