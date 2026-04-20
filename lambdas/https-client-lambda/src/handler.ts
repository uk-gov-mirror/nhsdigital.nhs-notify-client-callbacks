import type { SQSBatchItemFailure, SQSRecord } from "aws-lambda";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";
import pMap from "p-map";
import { logger } from "@nhs-notify-client-callbacks/logger";
import { loadTargetConfig } from "services/config-loader";
import { getApplicationId } from "services/ssm-applications-map";
import { signPayload } from "services/payload-signer";
import { buildAgent } from "services/delivery/tls-agent-factory";
import { deliverPayload } from "services/delivery/https-client";
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
  getRedisClient,
  recordResult,
} from "services/endpoint-gate";
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

const DEFAULT_MAX_RETRY_DURATION_MS = 7_200_000;
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
    recordAdmissionDenied(clientId, targetId, gateResult.reason);
    await changeVisibility(record.receiptHandle, delaySec);
    throw new Error(`Admission denied: ${gateResult.reason}`);
  }
}

async function handleDeliveryResult(
  result: DeliveryResult,
  record: SQSRecord,
  redis: RedisClientType,
  clientId: string,
  targetId: string,
  cbEnabled: boolean,
): Promise<void> {
  if (result.outcome === "success") {
    if (cbEnabled) {
      const cbOutcome = await recordResult(redis, targetId, true, gateConfig);
      if (cbOutcome.ok && cbOutcome.state === "closed") {
        recordCircuitBreakerClosed(targetId);
      }
    }
    recordDeliverySuccess(clientId, targetId);
    return;
  }

  if (result.outcome === "permanent_failure") {
    recordDeliveryPermanentFailure(clientId, targetId);
    await sendToDlq(record.body);
    return;
  }

  if (result.outcome === "rate_limited") {
    const receiveCount = Number(record.attributes.ApproximateReceiveCount);
    recordDeliveryRateLimited(clientId, targetId);
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
      recordCircuitBreakerOpen(targetId);
    }
  }
  recordDeliveryFailure(clientId, targetId, result.statusCode, backoffSec);
  await changeVisibility(record.receiptHandle, backoffSec);
  throw new Error(`Transient failure: ${result.statusCode}`);
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

  logger.info("Processing delivery", { clientId: CLIENT_ID, targetId });

  const target = await loadTargetConfig(CLIENT_ID, targetId);
  const maxRetryDurationMs =
    target.delivery?.maxRetryDurationSeconds === undefined
      ? DEFAULT_MAX_RETRY_DURATION_MS
      : target.delivery.maxRetryDurationSeconds * 1000;

  const firstReceivedMs = Number(
    record.attributes.ApproximateFirstReceiveTimestamp,
  );

  if (isWindowExhausted(firstReceivedMs, maxRetryDurationMs)) {
    recordRetryWindowExhausted(CLIENT_ID, targetId);
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
  );

  const agent = await buildAgent(target);
  const signature = signPayload(
    applicationId,
    target.apiKey.headerValue,
    payload,
  );
  const payloadJson = JSON.stringify(payload);

  recordDeliveryAttempt(CLIENT_ID, targetId);
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
  );
}

export async function processRecords(
  records: SQSRecord[],
): Promise<SQSBatchItemFailure[]> {
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
      } catch {
        return { itemIdentifier: record.messageId };
      }
    },
    { concurrency: concurrencyLimit },
  );

  await flushMetrics();
  return results.filter((r): r is SQSBatchItemFailure => r !== null);
}
