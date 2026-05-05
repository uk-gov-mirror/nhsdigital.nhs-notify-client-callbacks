import type { SQSBatchItemFailure, SQSRecord } from "aws-lambda";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";
import pMap from "p-map";
import { logger } from "@nhs-notify-client-callbacks/logger";
import { loadTargetConfig } from "services/config-loader";
import { getApplicationId } from "services/ssm-applications-map";
import { signPayload } from "services/payload-signer";
import { buildAgent } from "services/delivery/tls-agent-factory";
import {
  OUTCOME_PERMANENT_FAILURE,
  OUTCOME_RATE_LIMITED,
  OUTCOME_SUCCESS,
  deliverPayload,
} from "services/delivery/https-client";
import { sendToDlq } from "services/dlq-sender";
import { changeVisibility } from "services/sqs-visibility";
import {
  handleRateLimitedRecord,
  isWindowExhausted,
  jitteredBackoffSeconds,
} from "services/delivery/retry-policy";
import { VisibilityManagedError } from "services/visibility-managed-error";
import {
  type EndpointGateConfig,
  admit,
  recordResult,
} from "services/endpoint-gate";
import { getRedisClient } from "services/redis-client";
import {
  recordAdmissionDenied,
  recordCircuitBreakerClosed,
  recordCircuitBreakerOpen,
  recordDeliveryAttempt,
  recordDeliveryDuration,
  recordDeliveryFailure,
  recordDeliveryPermanentFailure,
  recordDeliveryRateLimited,
  recordDeliverySuccess,
  recordRetryWindowExhausted,
} from "services/delivery-observability";
import { flushMetrics, resetMetrics } from "services/delivery-metrics";

type RedisClientType = Awaited<ReturnType<typeof getRedisClient>>;

const DEFAULT_MAX_RETRY_DURATION_MS = 7_200_000; // 2 hours
const DEFAULT_CONCURRENCY_LIMIT = 10;
const BURST_MULTIPLIER = 5;
const MAX_BURST_CAPACITY = Number(
  process.env.TOKEN_BUCKET_BURST_CAPACITY ?? "2250",
);
const SQS_MAX_VISIBILITY_TIMEOUT_SEC = 43_200; // 12 hours

const gateConfig: EndpointGateConfig = {
  // Max tokens the bucket can hold — absorbs short traffic bursts without throttling
  burstCapacity: MAX_BURST_CAPACITY,
  // Probe rate to test endpoint recovery when half-open (default: 1/60 req/s)
  probeRateLimit: Number(process.env.CB_PROBE_RATE_LIMIT ?? String(1 / 60)),
  // Linear ramp-up after circuit closes, avoids flooding a freshly recovered endpoint (default: 10 min)
  recoveryPeriodMs: Number(process.env.CB_RECOVERY_PERIOD_MS ?? "600000"),
  // Sliding window over which failure rates are sampled (default: 5 min)
  samplePeriodMs: Number(process.env.CB_SAMPLE_PERIOD_MS ?? "300000"),
  // Failure rate within the sample window that triggers circuit open (default: 30%)
  failureThreshold: Number(process.env.CB_FAILURE_THRESHOLD ?? "0.3"),
  // Minimum attempts in the sample window before the failure rate is evaluated (default: 5 attempts)
  minAttempts: Number(process.env.CB_MIN_ATTEMPTS ?? "5"),
  // Full block after circuit opens, before half-open probes begin (default: 2 min)
  cooldownPeriodMs: Number(process.env.CB_COOLDOWN_PERIOD_MS ?? "120000"),
};

type CallbackDeliveryMessage = {
  payload: ClientCallbackPayload;
  subscriptionId: string;
  targetId: string;
};

type TargetBatch = {
  targetId: string;
  records: SQSRecord[];
  messages: CallbackDeliveryMessage[];
};

function groupByTarget(records: SQSRecord[]): TargetBatch[] {
  const groups = new Map<
    string,
    { records: SQSRecord[]; messages: CallbackDeliveryMessage[] }
  >();

  for (const record of records) {
    const message: CallbackDeliveryMessage = JSON.parse(record.body);
    const existing = groups.get(message.targetId);
    if (existing) {
      existing.records.push(record);
      existing.messages.push(message);
    } else {
      groups.set(message.targetId, { records: [record], messages: [message] });
    }
  }

  return [...groups.entries()].map(
    ([targetId, { messages, records: recs }]) => ({
      targetId,
      records: recs,
      messages,
    }),
  );
}

function extractCorrelationId(
  message: CallbackDeliveryMessage,
): string | undefined {
  return message.payload.data[0]?.attributes?.messageId;
}

async function deliverRecord(
  record: SQSRecord,
  message: CallbackDeliveryMessage,
  target: Awaited<ReturnType<typeof loadTargetConfig>>,
  applicationId: string,
  clientId: string,
): Promise<{ success: boolean; dlq: boolean }> {
  const correlationId = extractCorrelationId(message);
  const receiveCount = Number(record.attributes.ApproximateReceiveCount);

  logger.info("Processing delivery record", {
    correlationId,
    receiveCount,
    firstReceivedAt: new Date(
      Number(record.attributes.ApproximateFirstReceiveTimestamp),
    ).toISOString(),
  });

  const maxRetryDurationMs =
    target.delivery?.maxRetryDurationSeconds === undefined
      ? DEFAULT_MAX_RETRY_DURATION_MS
      : target.delivery.maxRetryDurationSeconds * 1000;

  const firstReceivedMs = Number(
    record.attributes.ApproximateFirstReceiveTimestamp,
  );

  if (isWindowExhausted(firstReceivedMs, maxRetryDurationMs)) {
    recordRetryWindowExhausted(clientId, message.targetId, correlationId);
    await sendToDlq(record.body);
    return { success: true, dlq: true };
  }

  const agent = await buildAgent(target);
  const signature = signPayload(
    applicationId,
    target.apiKey.headerValue,
    message.payload,
  );
  const payloadJson = JSON.stringify(message.payload);

  recordDeliveryAttempt(
    clientId,
    message.targetId,
    correlationId,
    record.messageId,
    receiveCount,
  );
  const deliveryStart = Date.now();
  const result = await deliverPayload(target, payloadJson, signature, agent);
  recordDeliveryDuration(message.targetId, Date.now() - deliveryStart);

  if (result.outcome === OUTCOME_SUCCESS) {
    recordDeliverySuccess(clientId, message.targetId, correlationId);
    return { success: true, dlq: false };
  }

  if (result.outcome === OUTCOME_PERMANENT_FAILURE) {
    recordDeliveryPermanentFailure(
      clientId,
      message.targetId,
      result.statusCode,
      result.errorCode,
      correlationId,
    );
    await sendToDlq(record.body, result);
    return { success: true, dlq: true };
  }

  if (result.outcome === OUTCOME_RATE_LIMITED) {
    recordDeliveryRateLimited(clientId, message.targetId, correlationId);
    await handleRateLimitedRecord(
      record,
      clientId,
      message.targetId,
      result.retryAfterHeader,
      receiveCount,
    );
    return { success: true, dlq: false };
  }

  const backoffSec = jitteredBackoffSeconds(receiveCount);
  recordDeliveryFailure(
    clientId,
    message.targetId,
    result.statusCode,
    backoffSec,
    receiveCount,
    correlationId,
  );
  await changeVisibility(record.receiptHandle, backoffSec);
  return { success: false, dlq: false };
}

type TargetBatchResult = {
  failures: SQSBatchItemFailure[];
  deliveredCount: number;
  dlqCount: number;
};

async function handleBatchDenied(
  batch: TargetBatch,
  clientId: string,
  reason: string,
  retryAfterMs: number,
): Promise<TargetBatchResult> {
  const baseDelaySec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const correlationIds = batch.messages.map((m) => extractCorrelationId(m));
  recordAdmissionDenied(clientId, batch.targetId, reason, correlationIds);
  const failures: SQSBatchItemFailure[] = [];
  for (const record of batch.records) {
    const receiveCount = Number(record.attributes.ApproximateReceiveCount);
    const delaySec = Math.min(
      receiveCount * baseDelaySec,
      SQS_MAX_VISIBILITY_TIMEOUT_SEC,
    );
    await changeVisibility(record.receiptHandle, delaySec);
    failures.push({ itemIdentifier: record.messageId });
  }
  return { failures, deliveredCount: 0, dlqCount: 0 };
}

async function processTargetBatch(
  batch: TargetBatch,
  redis: RedisClientType,
  clientId: string,
  concurrencyLimit: number,
): Promise<TargetBatchResult> {
  const target = await loadTargetConfig(clientId, batch.targetId);
  const cbEnabled = target.delivery?.circuitBreaker?.enabled ?? false;

  const targetBurstCapacity = Math.min(
    target.invocationRateLimit * BURST_MULTIPLIER,
    MAX_BURST_CAPACITY,
  );

  const gateResult = await admit(
    redis,
    batch.targetId,
    target.invocationRateLimit,
    cbEnabled,
    batch.records.length,
    { ...gateConfig, burstCapacity: targetBurstCapacity },
  );

  if (!gateResult.allowed) {
    return handleBatchDenied(
      batch,
      clientId,
      gateResult.reason,
      gateResult.retryAfterMs,
    );
  }

  const { consumedTokens } = gateResult;
  const admitted = batch.records.slice(0, consumedTokens);
  const rejected = batch.records.slice(consumedTokens);
  const admittedMessages = batch.messages.slice(0, consumedTokens);

  const applicationId = await getApplicationId(clientId);

  const failures: SQSBatchItemFailure[] = [];
  let processingFailures = 0;

  const admittedPairs = admitted.map(
    (record, i): { record: SQSRecord; message: CallbackDeliveryMessage } => ({
      record,
      message: admittedMessages[i], // eslint-disable-line security/detect-object-injection -- i is the numeric index from .map(), not user input
    }),
  );

  const deliveryResults = await pMap(
    admittedPairs,
    async ({
      message,
      record,
    }): Promise<{ record: SQSRecord; success: boolean; dlq: boolean }> => {
      try {
        const outcome = await deliverRecord(
          record,
          message,
          target,
          applicationId,
          clientId,
        );
        return { record, success: outcome.success, dlq: outcome.dlq };
      } catch (error) {
        const correlationId = extractCorrelationId(message);
        logger.error("Failed to process record", {
          messageId: record.messageId,
          correlationId,
          err: error,
        });

        if (error instanceof VisibilityManagedError) {
          const receiveCount = Number(
            record.attributes.ApproximateReceiveCount,
          );
          await changeVisibility(
            record.receiptHandle,
            jitteredBackoffSeconds(receiveCount),
          );
          return { record, success: false, dlq: false };
        }

        await sendToDlq(record.body);
        return { record, success: true, dlq: true };
      }
    },
    { concurrency: concurrencyLimit },
  );

  for (const { record, success } of deliveryResults) {
    if (!success) {
      processingFailures += 1;
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  const deliveredCount = deliveryResults.filter(
    (r) => r.success && !r.dlq,
  ).length;
  const dlqCount = deliveryResults.filter((r) => r.dlq).length;

  if (cbEnabled && consumedTokens > 0) {
    const cbOutcome = await recordResult(
      redis,
      batch.targetId,
      consumedTokens,
      processingFailures,
      gateConfig,
    );
    if (cbOutcome.circuitSwitched && cbOutcome.circuitState === "open") {
      recordCircuitBreakerOpen(batch.targetId);
    }
    if (
      cbOutcome.circuitSwitched &&
      cbOutcome.circuitState === "closed_recovery"
    ) {
      recordCircuitBreakerClosed(batch.targetId);
    }
  }

  if (rejected.length > 0) {
    const rejectedMessages = batch.messages.slice(consumedTokens);
    const rejectedCorrelationIds = rejectedMessages.map((m) =>
      extractCorrelationId(m),
    );
    recordAdmissionDenied(
      clientId,
      batch.targetId,
      "rate_limited",
      rejectedCorrelationIds,
    );
    for (const record of rejected) {
      const receiveCount = Number(record.attributes.ApproximateReceiveCount);
      const delaySec = receiveCount * 1;
      await changeVisibility(record.receiptHandle, delaySec);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { failures, deliveredCount, dlqCount };
}

export async function processRecords(
  records: SQSRecord[],
): Promise<SQSBatchItemFailure[]> {
  const { CLIENT_ID } = process.env;
  if (!CLIENT_ID) {
    logger.error("CLIENT_ID is required — sending all records to DLQ");
    await Promise.all(records.map((record) => sendToDlq(record.body)));
    return [];
  }

  resetMetrics();

  const concurrencyLimit = Number(
    process.env.CONCURRENCY_LIMIT ?? String(DEFAULT_CONCURRENCY_LIMIT),
  );

  logger.info("Batch received", { batchSize: records.length });

  const redis = await getRedisClient();
  const targetBatches = groupByTarget(records);

  const allFailures: SQSBatchItemFailure[] = [];
  let totalDelivered = 0;
  let totalDlq = 0;

  for (const batch of targetBatches) {
    const batchResult = await processTargetBatch(
      batch,
      redis,
      CLIENT_ID,
      concurrencyLimit,
    );
    allFailures.push(...batchResult.failures);
    totalDelivered += batchResult.deliveredCount;
    totalDlq += batchResult.dlqCount;
  }

  logger.info("Batch complete", {
    batchSize: records.length,
    deliveredCount: totalDelivered,
    dlqCount: totalDlq,
    failureCount: allFailures.length,
  });

  await flushMetrics();
  return allFailures;
}
