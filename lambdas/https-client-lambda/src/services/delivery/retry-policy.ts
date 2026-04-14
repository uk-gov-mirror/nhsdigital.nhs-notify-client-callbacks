import type { SQSRecord } from "aws-lambda";
import { logger } from "services/logger";
import { sendToDlq } from "services/dlq-sender";
import { changeVisibility } from "services/sqs-visibility";

const BACKOFF_CAP_SECONDS = 300;
const SQS_MAX_VISIBILITY_SECONDS = 43_200;
const BASE_BACKOFF_MULTIPLIER = 5;
const BACKOFF_EXPONENT_BASE = 2;

export function jitteredBackoffSeconds(receiveCount: number): number {
  const ceiling = Math.min(
    BASE_BACKOFF_MULTIPLIER * BACKOFF_EXPONENT_BASE ** (receiveCount - 1),
    BACKOFF_CAP_SECONDS,
  );
  // eslint-disable-next-line sonarjs/pseudo-random -- jitter for backoff, not security-sensitive
  return Math.floor(Math.random() * ceiling);
}

export function parseRetryAfter(header: string): number {
  const asInt = Number(header);

  if (!Number.isNaN(asInt) && Number.isFinite(asInt)) {
    return Math.max(0, Math.floor(asInt));
  }

  const date = new Date(header);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
}

export function isWindowExhausted(
  firstReceivedMs: number,
  maxRetryDurationMs: number,
): boolean {
  return Date.now() - firstReceivedMs >= maxRetryDurationMs;
}

export function exceedsSqsMaxVisibility(retryAfterSeconds: number): boolean {
  return retryAfterSeconds > SQS_MAX_VISIBILITY_SECONDS;
}

export async function handleRateLimitedRecord(
  record: SQSRecord,
  clientId: string,
  targetId: string,
  retryAfterHeader: string | undefined,
  receiveCount: number,
): Promise<void> {
  const retryAfterSeconds = retryAfterHeader
    ? parseRetryAfter(retryAfterHeader)
    : 0;

  if (exceedsSqsMaxVisibility(retryAfterSeconds)) {
    logger.warn("429 Retry-After exceeds SQS max — sending to DLQ", {
      clientId,
      targetId,
      retryAfterSeconds,
    });
    await sendToDlq(record.body);
    return;
  }

  const delaySec =
    retryAfterSeconds > 0
      ? retryAfterSeconds
      : jitteredBackoffSeconds(receiveCount);

  logger.warn("Rate limited (429) — requeuing", {
    clientId,
    targetId,
    delaySec,
  });
  await changeVisibility(record.receiptHandle, delaySec);
  throw new Error("Rate limited — requeue");
}
