import type {
  DeliveryMetricsSnapshot,
  MetricsSnapshot,
  PerformanceResult,
  PhaseResult,
  RunnerDeps,
  Scenario,
} from "types";
import { generatePhaseLoad } from "sqs";
import { queryDeliveryMetricsSnapshot, queryMetricsSnapshot } from "cloudwatch";

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
  let stopPolling = false;

  const deliveryLogGroupNames = buildDeliveryLogGroupNames(
    deps.deliveryLogGroupPrefix,
    scenario,
  );

  const pollLoop = async (): Promise<void> => {
    await sleepFn(scenario.metricsIntervalSecs * 1000);
    while (!stopPolling) {
      const startSec = Math.floor(testStartMs / 1000);
      const endSec = Math.floor(Date.now() / 1000);

      const snap = await queryMetricsSnapshot(
        deps.cloudWatchClient,
        deps.logGroupName,
        startSec,
        endSec,
      );
      if (snap !== null) snapshots.push(snap);

      if (deliveryLogGroupNames.length > 0) {
        const deliverySnap = await queryDeliveryMetricsSnapshot(
          deps.cloudWatchClient,
          deliveryLogGroupNames,
          startSec,
          endSec,
        );
        if (deliverySnap !== null) deliverySnapshots.push(deliverySnap);
      }

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
      scenario.eventMix,
    );
    phaseResults.push(result);
  }

  stopPolling = true;
  await pollPromise;

  await sleepFn(CLOUDWATCH_SETTLING_MS);

  const finalStartSec = Math.floor(testStartMs / 1000);
  const finalEndSec = Math.floor(Date.now() / 1000);

  const finalSnap = await queryMetricsSnapshot(
    deps.cloudWatchClient,
    deps.logGroupName,
    finalStartSec,
    finalEndSec,
  );
  if (finalSnap !== null) snapshots.push(finalSnap);

  if (deliveryLogGroupNames.length > 0) {
    const finalDeliverySnap = await queryDeliveryMetricsSnapshot(
      deps.cloudWatchClient,
      deliveryLogGroupNames,
      finalStartSec,
      finalEndSec,
    );
    if (finalDeliverySnap !== null) deliverySnapshots.push(finalDeliverySnap);
  }

  return {
    testId,
    scenario,
    startedAt,
    completedAt: new Date().toISOString(),
    phases: phaseResults,
    metrics: snapshots,
    deliveryMetrics: deliverySnapshots,
  };
}
