import type {
  CircuitBreakerSnapshot,
  DeliveryMetricsSnapshot,
  MetricsSnapshot,
  PerClientRateTimeline,
  PerformanceResult,
  PhaseResult,
  RunnerDeps,
  Scenario,
} from "types";
import { generatePhaseLoad } from "sqs";
import {
  queryCircuitBreakerSnapshot,
  queryDeliveryMetricsSnapshot,
  queryMetricsSnapshot,
  queryPerClientRateTimeline,
} from "cloudwatch";

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

export async function runPerformanceTest(
  deps: RunnerDeps,
  scenario: Scenario,
  testId: string,
  sleepFn: (ms: number) => Promise<void> = defaultSleep,
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

      if (!stopPolling) {
        await sleepFn(scenario.metricsIntervalSecs * 1000);
      }
    }
  };

  const pollPromise = pollLoop();

  for (const phase of scenario.phases) {
    const result = await generatePhaseLoad(
      deps.sqsClient,
      deps.queueUrl,
      phase,
      phase.eventMix ?? scenario.eventMix,
    );
    phaseResults.push(result);
  }

  stopPolling = true;
  await pollPromise;

  await sleepFn(CLOUDWATCH_SETTLING_MS);

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

  const perClientRateTimelines: PerClientRateTimeline[] = [];

  if (deps.deliveryLogGroupPrefix) {
    const clientIds = [...new Set(scenario.eventMix.map((e) => e.clientId))];
    const timelinePromises = clientIds.map(async (clientId) => {
      const logGroupName = `${deps.deliveryLogGroupPrefix}${clientId}`;
      const entries = await queryPerClientRateTimeline(
        deps.cloudWatchClient,
        logGroupName,
        finalStartSec,
        finalEndSec,
      );
      return { clientId, entries };
    });
    const timelines = await Promise.all(timelinePromises);
    perClientRateTimelines.push(
      ...timelines.filter((t) => t.entries.length > 0),
    );
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
  };
}
