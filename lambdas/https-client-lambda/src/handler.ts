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
import type { DeliveryResult } from "services/delivery/https-client";
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
import { VisibilityManagedError } from "services/visibility-managed-error";
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
const DEFAULT_CONCURRENCY_LIMIT = 5;

const gateConfig: EndpointGateConfig = {
  burstCapacity: Number(process.env.TOKEN_BUCKET_BURST_CAPACITY ?? "10"),
  cbProbeIntervalMs: Number(process.env.CB_PROBE_INTERVAL_MS ?? "60000"),
  decayPeriodMs: Number(process.env.CB_DECAY_PERIOD_MS ?? "300000"),
  cbWindowPeriodMs: Number(process.env.CB_WINDOW_PERIOD_MS ?? "60000"),
  cbErrorThreshold: Number(process.env.CB_ERROR_THRESHOLD ?? "0.5"),
  cbMinAttempts: Number(process.env.CB_MIN_ATTEMPTS ?? "10"),
  cbCooldownMs: Number(process.env.CB_COOLDOWN_MS ?? "60000"),
};

type CallbackDeliveryMessage = {
  payload: ClientCallbackPayload;
  subscriptionId: string;
  targetId: string;
};

async function checkAdmission(
  redis: RedisClientType,
  targetId: string,
  invocationRateLimit: number,
  cbEnabled: boolean,
  clientId: string,
  record: SQSRecord,
  correlationId?: string,
): Promise<void> {
  const gateResult = await admit(
    redis,
    targetId,
    invocationRateLimit,
    cbEnabled,
    gateConfig,
  );

  if (!gateResult.allowed) {
    const delaySec = Math.ceil(gateResult.retryAfterMs / 1000);
    recordAdmissionDenied(clientId, targetId, gateResult.reason, correlationId);
    await changeVisibility(record.receiptHandle, delaySec);
    throw new VisibilityManagedError(`Admission denied: ${gateResult.reason}`);
  }
}

async function handleDeliveryResult(
  result: DeliveryResult,
  record: SQSRecord,
  redis: RedisClientType,
  clientId: string,
  targetId: string,
  cbEnabled: boolean,
  correlationId?: string,
): Promise<void> {
  if (result.outcome === OUTCOME_SUCCESS) {
    if (cbEnabled) {
      const cbOutcome = await recordResult(redis, targetId, true, gateConfig);
      if (cbOutcome.ok && cbOutcome.state === "closed") {
        recordCircuitBreakerClosed(targetId, correlationId);
      }
    }
    recordDeliverySuccess(clientId, targetId, correlationId);
    return;
  }

  if (result.outcome === OUTCOME_PERMANENT_FAILURE) {
    recordDeliveryPermanentFailure(
      clientId,
      targetId,
      result.statusCode,
      result.errorCode,
      correlationId,
    );
    await sendToDlq(record.body, result);
    return;
  }

  if (result.outcome === OUTCOME_RATE_LIMITED) {
    const receiveCount = Number(record.attributes.ApproximateReceiveCount);
    recordDeliveryRateLimited(clientId, targetId, correlationId);
    await handleRateLimitedRecord(
      record,
      clientId,
      targetId,
      result.retryAfterHeader,
      receiveCount,
    );
    return;
  }

  const receiveCount = Number(record.attributes.ApproximateReceiveCount);
  const backoffSec = jitteredBackoffSeconds(receiveCount);
  if (cbEnabled) {
    const cbOutcome = await recordResult(redis, targetId, false, gateConfig);
    if (cbOutcome.state === "opened") {
      recordCircuitBreakerOpen(targetId, correlationId);
    }
  }
  recordDeliveryFailure(
    clientId,
    targetId,
    result.statusCode,
    backoffSec,
    receiveCount,
    correlationId,
  );
  await changeVisibility(record.receiptHandle, backoffSec);
  throw new VisibilityManagedError(`Transient failure: ${result.statusCode}`);
}

async function processRecord(
  record: SQSRecord,
  redis: RedisClientType,
): Promise<void> {
  const { CLIENT_ID } = process.env;
  if (!CLIENT_ID) {
    throw new Error("CLIENT_ID is required");
  }

  const message: CallbackDeliveryMessage = JSON.parse(record.body);
  const { payload, targetId } = message;
  const messageId = payload.data[0]?.attributes?.messageId;

  logger.info("Processing delivery", {
    clientId: CLIENT_ID,
    targetId,
    messageId,
    sqsMessageId: record.messageId,
  });

  const target = await loadTargetConfig(CLIENT_ID, targetId);
  const maxRetryDurationMs =
    target.delivery?.maxRetryDurationSeconds === undefined
      ? DEFAULT_MAX_RETRY_DURATION_MS
      : target.delivery.maxRetryDurationSeconds * 1000;

  const firstReceivedMs = Number(
    record.attributes.ApproximateFirstReceiveTimestamp,
  );

  if (isWindowExhausted(firstReceivedMs, maxRetryDurationMs)) {
    recordRetryWindowExhausted(CLIENT_ID, targetId, messageId);
    await sendToDlq(record.body);
    return;
  }

  const applicationId = await getApplicationId(CLIENT_ID);
  const cbEnabled = target.delivery?.circuitBreaker?.enabled ?? false;

  await checkAdmission(
    redis,
    targetId,
    target.invocationRateLimit,
    cbEnabled,
    CLIENT_ID,
    record,
    messageId,
  );

  const agent = await buildAgent(target);
  const signature = signPayload(
    applicationId,
    target.apiKey.headerValue,
    payload,
  );
  const payloadJson = JSON.stringify(payload);

  recordDeliveryAttempt(CLIENT_ID, targetId, messageId);
  const deliveryStart = Date.now();
  const result = await deliverPayload(target, payloadJson, signature, agent);
  recordDeliveryDuration(targetId, Date.now() - deliveryStart);

  await handleDeliveryResult(
    result,
    record,
    redis,
    CLIENT_ID,
    targetId,
    cbEnabled,
    messageId,
  );
}

export async function processRecords(
  records: SQSRecord[],
): Promise<SQSBatchItemFailure[]> {
  resetMetrics();

  logger.info("Batch received", { batchSize: records.length });

  const concurrencyLimit = Number(
    process.env.CONCURRENCY_LIMIT ?? String(DEFAULT_CONCURRENCY_LIMIT),
  );

  const redis = await getRedisClient();

  const results = await pMap(
    records,
    async (record): Promise<SQSBatchItemFailure | null> => {
      try {
        await processRecord(record, redis);
        return null;
      } catch (error) {
        if (!(error instanceof VisibilityManagedError)) {
          logger.error("Failed to process record", {
            messageId: record.messageId,
            err: error,
          });
          const receiveCount = Number(
            record.attributes.ApproximateReceiveCount,
          );
          await changeVisibility(
            record.receiptHandle,
            jitteredBackoffSeconds(receiveCount),
          );
        }
        return { itemIdentifier: record.messageId };
      }
    },
    { concurrency: concurrencyLimit },
  );

  await flushMetrics();
  const failures = results.filter((r): r is SQSBatchItemFailure => r !== null);
  const successCount = records.length - failures.length;
  logger.info("Batch complete", {
    batchSize: records.length,
    successCount,
    failureCount: failures.length,
  });
  return failures;
}
