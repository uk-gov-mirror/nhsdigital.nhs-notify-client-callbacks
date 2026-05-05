import type {
  CircuitBreakerSnapshot,
  DeliveryMetricsSnapshot,
  ElastiCacheDeps,
  EndpointRateLimitState,
  MetricsSnapshot,
  PerClientRateTimeline,
  PerformanceResult,
  PhaseResult,
  RunnerDeps,
  Scenario,
  WebhookVerificationResult,
} from "types";
import { Logger } from "@nhs-notify-client-callbacks/logger";
import { generatePhaseLoad } from "sqs";
import { deriveQueueUrls, purgeQueues } from "purge";
import { getQueueDepths } from "sqs-stats";
import { dumpRateLimitState, flushElastiCache } from "elasticache";
import { verifyMockWebhook } from "webhook-verify";
import {
  queryCircuitBreakerSnapshot,
  queryDeliveryMetricsSnapshot,
  queryMetricsSnapshot,
  queryPerClientRateTimeline,
} from "cloudwatch";

const logger = new Logger();

const CLOUDWATCH_SETTLING_MS = 60_000;

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function buildDeliveryLogGroupNames(
  prefix: string | undefined,
  scenario: Scenario,
): string[] {
  if (!prefix) return [];
  const clientIds = new Set(scenario.eventMix.map((e) => e.clientId));
  return [...clientIds].map((id) => `${prefix}${id}`);
}

async function collectSnapshots(
  deps: RunnerDeps,
  deliveryLogGroupNames: string[],
  startSec: number,
  endSec: number,
  cbStartSec: number,
  out: {
    snapshots: MetricsSnapshot[];
    deliverySnapshots: DeliveryMetricsSnapshot[];
    cbSnapshots: CircuitBreakerSnapshot[];
  },
): Promise<number> {
  const snap = await queryMetricsSnapshot(
    deps.cloudWatchClient,
    deps.logGroupName,
    startSec,
    endSec,
  );
  if (snap !== null) out.snapshots.push(snap);

  if (deliveryLogGroupNames.length > 0) {
    const deliverySnap = await queryDeliveryMetricsSnapshot(
      deps.cloudWatchClient,
      deliveryLogGroupNames,
      startSec,
      endSec,
    );
    if (deliverySnap !== null) out.deliverySnapshots.push(deliverySnap);

    const cbSnap = await queryCircuitBreakerSnapshot(
      deps.cloudWatchClient,
      deliveryLogGroupNames,
      cbStartSec,
      endSec,
    );
    if (cbSnap !== null) {
      out.cbSnapshots.push(cbSnap);
      return endSec;
    }
  }

  return cbStartSec;
}

async function collectPerClientRateTimelines(
  deps: RunnerDeps,
  scenario: Scenario,
  startSec: number,
  endSec: number,
): Promise<PerClientRateTimeline[]> {
  if (!deps.deliveryLogGroupPrefix) {
    return [];
  }

  const clientIds = [...new Set(scenario.eventMix.map((e) => e.clientId))];
  const timelinePromises = clientIds.map(async (clientId) => {
    const logGroupName = `${deps.deliveryLogGroupPrefix}${clientId}`;
    const entries = await queryPerClientRateTimeline(
      deps.cloudWatchClient,
      logGroupName,
      startSec,
      endSec,
    );
    return { clientId, entries };
  });
  const timelines = await Promise.all(timelinePromises);
  return timelines.filter((t) => t.entries.length > 0);
}

async function collectWebhookVerification(
  deps: RunnerDeps,
  startSec: number,
  endSec: number,
): Promise<WebhookVerificationResult | undefined> {
  if (!deps.mockWebhookLogGroup) {
    return undefined;
  }
  return verifyMockWebhook(
    deps.cloudWatchClient,
    deps.mockWebhookLogGroup,
    startSec,
    endSec,
  );
}

export async function runPerformanceTest(
  deps: RunnerDeps,
  scenario: Scenario,
  testId: string,
  sleepFn: (ms: number) => Promise<void> = defaultSleep,
  elastiCacheDeps?: ElastiCacheDeps,
  cloudWatchSettlingMs: number = CLOUDWATCH_SETTLING_MS,
  skipPurge = false,
): Promise<PerformanceResult> {
  if (scenario.eventMix.length === 0) {
    throw new Error("scenario.eventMix must contain at least one entry");
  }

  for (const [index, phase] of scenario.phases.entries()) {
    if (phase.durationSecs <= 0) {
      throw new Error(
        `scenario.phases[${index}].durationSecs must be greater than 0`,
      );
    }
    if (phase.targetEps <= 0) {
      throw new Error(
        `scenario.phases[${index}].targetEps must be greater than 0`,
      );
    }
  }

  const testStartMs = Date.now();

  const queueUrls = deriveQueueUrls(
    deps.queueUrl,
    scenario,
    deps.deliveryQueueUrlPrefix,
  );

  if (skipPurge) {
    logger.info("Skipping queue purge", { queueUrls });
  } else {
    logger.info("Purging queues", { queueUrls });
    await purgeQueues(deps.sqsClient, queueUrls);
  }
  if (elastiCacheDeps) {
    logger.info("Clearing rate limit and circuit breaker state");
    await flushElastiCache(elastiCacheDeps);
  }

  let rateLimitStateBefore: EndpointRateLimitState[] | undefined;
  if (elastiCacheDeps) {
    rateLimitStateBefore = await dumpRateLimitState(elastiCacheDeps);
  }

  const startedAt = new Date(testStartMs).toISOString();
  const phaseResults: PhaseResult[] = [];
  const snapshots: MetricsSnapshot[] = [];
  const deliverySnapshots: DeliveryMetricsSnapshot[] = [];
  const cbSnapshots: CircuitBreakerSnapshot[] = [];
  let lastCbSnapshotSec = Math.floor(testStartMs / 1000);
  let stopPolling = false;

  const deliveryLogGroupNames = buildDeliveryLogGroupNames(
    deps.deliveryLogGroupPrefix,
    scenario,
  );

  const out = { snapshots, deliverySnapshots, cbSnapshots };

  const pollLoop = async (): Promise<void> => {
    await sleepFn(scenario.metricsIntervalSecs * 1000);
    while (!stopPolling) {
      const startSec = Math.floor(testStartMs / 1000);
      const endSec = Math.floor(Date.now() / 1000);

      lastCbSnapshotSec = await collectSnapshots(
        deps,
        deliveryLogGroupNames,
        startSec,
        endSec,
        lastCbSnapshotSec,
        out,
      );
      logger.info("Sampling queue depths", { queueUrls });
      const depthSample = await getQueueDepths(deps.sqsClient, queueUrls);
      logger.info("Queue depth sample", { queues: depthSample.queues });

      if (!stopPolling) {
        await sleepFn(scenario.metricsIntervalSecs * 1000);
      }
    }
  };

  const pollPromise = pollLoop();

  for (const [index, phase] of scenario.phases.entries()) {
    logger.info("Starting phase", {
      index,
      targetEps: phase.targetEps,
      durationSecs: phase.durationSecs,
    });
    const result = await generatePhaseLoad(
      deps.sqsClient,
      deps.queueUrl,
      phase,
      phase.eventMix ?? scenario.eventMix,
    );
    logger.info("Phase complete", {
      index,
      targetEps: result.targetEps,
      achievedEps: result.achievedEps,
      sent: result.sent,
      durationMs: result.durationMs,
    });
    phaseResults.push(result);
  }

  stopPolling = true;
  await pollPromise;

  logger.info("Waiting for CloudWatch logs to settle", {
    settlingMs: cloudWatchSettlingMs,
  });
  await sleepFn(cloudWatchSettlingMs);

  const finalStartSec = Math.floor(testStartMs / 1000);
  const finalEndSec = Math.floor(Date.now() / 1000);

  await collectSnapshots(
    deps,
    deliveryLogGroupNames,
    finalStartSec,
    finalEndSec,
    lastCbSnapshotSec,
    out,
  );
  logger.info("Sampling queue depths", { queueUrls });
  const finalDepthSample = await getQueueDepths(deps.sqsClient, queueUrls);
  logger.info("Final queue depth sample", { queues: finalDepthSample.queues });

  const perClientRateTimelines = await collectPerClientRateTimelines(
    deps,
    scenario,
    finalStartSec,
    finalEndSec,
  );

  const webhookVerification = await collectWebhookVerification(
    deps,
    finalStartSec,
    finalEndSec,
  );

  let rateLimitStateAfter: EndpointRateLimitState[] | undefined;
  if (elastiCacheDeps) {
    rateLimitStateAfter = await dumpRateLimitState(elastiCacheDeps);
  }

  if (skipPurge) {
    logger.info("Skipping final queue purge", { queueUrls });
  } else {
    await purgeQueues(deps.sqsClient, queueUrls);
    logger.info("Final queue purge complete", { queueUrls });
  }

  return {
    testId,
    scenario,
    startedAt,
    completedAt: new Date().toISOString(),
    phases: phaseResults,
    metrics: snapshots,
    deliveryMetrics: deliverySnapshots,
    circuitBreakerMetrics: cbSnapshots,
    perClientRateTimelines,
    webhookVerification,
    rateLimitStateBefore,
    rateLimitStateAfter,
  };
}
