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
import { flushMetrics } from "services/delivery-metrics";

type RedisClientType = Awaited<ReturnType<typeof getRedisClient>>;

const DEFAULT_MAX_RETRY_DURATION_MS = 7_200_000; // 2 hours
const DEFAULT_CONCURRENCY_LIMIT = 10;

const gateConfig: EndpointGateConfig = {
  // Max tokens the bucket can hold — absorbs short traffic bursts without throttling (default: 2250)
  burstCapacity: Number(process.env.TOKEN_BUCKET_BURST_CAPACITY ?? "2250"),
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

async function deliverRecord(
  record: SQSRecord,
  message: CallbackDeliveryMessage,
  target: Awaited<ReturnType<typeof loadTargetConfig>>,
  applicationId: string,
  clientId: string,
): Promise<"delivered" | "dlq" | "failed"> {
  const messageId = message.payload.data[0]?.attributes?.messageId;
  logger.info("Processing delivery", {
    clientId,
    targetId: message.targetId,
    messageId,
    sqsMessageId: record.messageId,
    receiveCount: record.attributes.ApproximateReceiveCount,
  });
  const maxRetryDurationMs =
    target.delivery?.maxRetryDurationSeconds === undefined
      ? DEFAULT_MAX_RETRY_DURATION_MS
      : target.delivery.maxRetryDurationSeconds * 1000;

  const firstReceivedMs = Number(
    record.attributes.ApproximateFirstReceiveTimestamp,
  );

  if (isWindowExhausted(firstReceivedMs, maxRetryDurationMs)) {
    recordRetryWindowExhausted(clientId, message.targetId);
    await sendToDlq(record.body);
    return "dlq";
  }
  const agent = await buildAgent(target);
  const signature = signPayload(
    applicationId,
    target.apiKey.headerValue,
    message.payload,
  );
  const payloadJson = JSON.stringify(message.payload);

  recordDeliveryAttempt(clientId, message.targetId);
  const deliveryStart = Date.now();
  const result = await deliverPayload(target, payloadJson, signature, agent);
  recordDeliveryDuration(message.targetId, Date.now() - deliveryStart);

  if (result.outcome === OUTCOME_SUCCESS) {
    recordDeliverySuccess(clientId, message.targetId);
    return "delivered";
  }

  if (result.outcome === OUTCOME_PERMANENT_FAILURE) {
    recordDeliveryPermanentFailure(
      clientId,
      message.targetId,
      result.statusCode,
      result.errorCode,
    );
    await sendToDlq(record.body, result);
    return "dlq";
  }

  if (result.outcome === OUTCOME_RATE_LIMITED) {
    const receiveCount = Number(record.attributes.ApproximateReceiveCount);
    recordDeliveryRateLimited(clientId, message.targetId);
    await handleRateLimitedRecord(
      record,
      clientId,
      message.targetId,
      result.retryAfterHeader,
      receiveCount,
    );
    return "delivered"; // unreachable — handleRateLimitedRecord always throws
  }

  const receiveCount = Number(record.attributes.ApproximateReceiveCount);
  const backoffSec = jitteredBackoffSeconds(receiveCount);
  recordDeliveryFailure(
    clientId,
    message.targetId,
    result.statusCode,
    backoffSec,
    receiveCount,
  );
  await changeVisibility(record.receiptHandle, backoffSec);
  return "failed";
}

async function processTargetBatch(
  batch: TargetBatch,
  redis: RedisClientType,
  clientId: string,
  concurrencyLimit: number,
): Promise<{
  failures: SQSBatchItemFailure[];
  deliveredCount: number;
  dlqCount: number;
  failureCount: number;
  admissionDeniedCount: number;
}> {
  logger.info("Batch received", {
    targetId: batch.targetId,
    batchSize: batch.records.length,
  });

  const target = await loadTargetConfig(clientId, batch.targetId);
  const cbEnabled = target.delivery?.circuitBreaker?.enabled ?? false;

  const gateResult = await admit(
    redis,
    batch.targetId,
    target.invocationRateLimit,
    cbEnabled,
    batch.records.length,
    gateConfig,
  );

  if (!gateResult.allowed) {
    const delaySec = Math.ceil(gateResult.retryAfterMs / 1000);
    recordAdmissionDenied(clientId, batch.targetId, gateResult.reason);
    const failures: SQSBatchItemFailure[] = [];
    for (const record of batch.records) {
      await changeVisibility(record.receiptHandle, delaySec);
      failures.push({ itemIdentifier: record.messageId });
    }
    return {
      failures,
      deliveredCount: 0,
      dlqCount: 0,
      failureCount: 0,
      admissionDeniedCount: batch.records.length,
    };
  }

  const { consumedTokens } = gateResult;
  const admitted = batch.records.slice(0, consumedTokens);
  const rejected = batch.records.slice(consumedTokens);
  const admittedMessages = batch.messages.slice(0, consumedTokens);

  const applicationId = await getApplicationId(clientId);

  const failures: SQSBatchItemFailure[] = [];
  let deliveredCount = 0;
  let dlqCount = 0;
  let processingFailures = 0;

  const deliveryResults = await pMap(
    admitted,
    async (
      record,
      index,
    ): Promise<{
      record: SQSRecord;
      outcome: "delivered" | "dlq" | "failed";
    }> => {
      try {
        const outcome = await deliverRecord(
          record,
          admittedMessages[index],
          target,
          applicationId,
          clientId,
        );
        return { record, outcome };
      } catch (error) {
        logger.error("Failed to process record", {
          messageId: record.messageId,
          err: error,
        });
        const receiveCount = Number(record.attributes.ApproximateReceiveCount);
        await changeVisibility(
          record.receiptHandle,
          jitteredBackoffSeconds(receiveCount),
        );
        return { record, outcome: "failed" };
      }
    },
    { concurrency: concurrencyLimit },
  );

  for (const { outcome, record } of deliveryResults) {
    if (outcome === "delivered") {
      deliveredCount += 1;
    } else if (outcome === "dlq") {
      dlqCount += 1;
    } else {
      processingFailures += 1;
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  if (cbEnabled && consumedTokens > 0) {
    const cbOutcome = await recordResult(
      redis,
      batch.targetId,
      consumedTokens,
      processingFailures,
      gateConfig,
    );
    if (!cbOutcome.ok && cbOutcome.state === "opened") {
      recordCircuitBreakerOpen(batch.targetId);
    }
    if (cbOutcome.ok && cbOutcome.state === "closed") {
      recordCircuitBreakerClosed(batch.targetId);
    }
  }

  for (const record of rejected) {
    failures.push({ itemIdentifier: record.messageId });
  }

  return {
    failures,
    deliveredCount,
    dlqCount,
    failureCount: processingFailures,
    admissionDeniedCount: rejected.length,
  };
}

export async function processRecords(
  records: SQSRecord[],
): Promise<SQSBatchItemFailure[]> {
  const { CLIENT_ID } = process.env;
  if (!CLIENT_ID) {
    throw new Error("CLIENT_ID is required");
  }

  const concurrencyLimit = Number(
    process.env.CONCURRENCY_LIMIT ?? String(DEFAULT_CONCURRENCY_LIMIT),
  );

  const redis = await getRedisClient();
  const targetBatches = groupByTarget(records);

  const allFailures: SQSBatchItemFailure[] = [];
  let totalDelivered = 0;
  let totalDlq = 0;
  let totalFailed = 0;
  let totalAdmissionDenied = 0;

  for (const batch of targetBatches) {
    const result = await processTargetBatch(
      batch,
      redis,
      CLIENT_ID,
      concurrencyLimit,
    );
    allFailures.push(...result.failures);
    totalDelivered += result.deliveredCount;
    totalDlq += result.dlqCount;
    totalFailed += result.failureCount;
    totalAdmissionDenied += result.admissionDeniedCount;
  }

  await flushMetrics();
  logger.info("Batch complete", {
    batchSize: records.length,
    deliveredCount: totalDelivered,
    dlqCount: totalDlq,
    failureCount: totalFailed,
    admissionDeniedCount: totalAdmissionDenied,
  });
  return allFailures;
}
