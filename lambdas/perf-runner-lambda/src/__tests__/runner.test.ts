import type { SQSClient } from "@aws-sdk/client-sqs";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type {
  CircuitBreakerSnapshot,
  DeliveryMetricsSnapshot,
  MetricsSnapshot,
  PhaseResult,
  RunnerDeps,
  Scenario,
} from "types";
import { defaultSleep, runPerformanceTest } from "runner";

import { generatePhaseLoad } from "sqs";
import {
  queryCircuitBreakerSnapshot,
  queryDeliveryMetricsSnapshot,
  queryMetricsSnapshot,
  queryPerClientRateTimeline,
} from "cloudwatch";

jest.mock("sqs");
jest.mock("cloudwatch");

const mockGeneratePhaseLoad = jest.mocked(generatePhaseLoad);
const mockQueryMetricsSnapshot = jest.mocked(queryMetricsSnapshot);
const mockQueryDeliveryMetricsSnapshot = jest.mocked(
  queryDeliveryMetricsSnapshot,
);
const mockQueryCircuitBreakerSnapshot = jest.mocked(
  queryCircuitBreakerSnapshot,
);
const mockQueryPerClientRateTimeline = jest.mocked(queryPerClientRateTimeline);

const immediateSleep = jest.fn().mockResolvedValue(undefined);

const mockPhaseResult: PhaseResult = {
  targetEps: 1000,
  achievedEps: 980,
  sent: 1000,
  durationMs: 1020,
};

const mockSnapshot: MetricsSnapshot = {
  snapshotAt: Date.now(),
  p50Ms: 30,
  p95Ms: 80,
  p99Ms: 150,
  count: 100,
};

const mockDeliverySnapshot: DeliveryMetricsSnapshot = {
  snapshotAt: Date.now(),
  deliveryCount: 50,
  p50Ms: 120,
  p95Ms: 300,
  p99Ms: 500,
};

const mockCbSnapshot: CircuitBreakerSnapshot = {
  snapshotAt: Date.now(),
  intervalStartSec: 0,
  intervalEndSec: 60,
  circuitOpenEvents: 1,
  circuitCloseEvents: 0,
  admissionDeniedCircuitOpen: 5,
  admissionDeniedRateLimited: 3,
  deliveryAttempts: 100,
  deliverySuccesses: 92,
  deliveryFailures: 5,
  deliveryRateLimited: 3,
};

const scenario: Scenario = {
  phases: [{ durationSecs: 1, targetEps: 1000 }],
  eventMix: [
    {
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "DELIVERED",
    },
  ],
  metricsIntervalSecs: 1,
};

const deps: RunnerDeps = {
  sqsClient: {} as SQSClient,
  cloudWatchClient: {} as CloudWatchLogsClient,
  queueUrl: "https://sqs.example.invalid/queue",
  logGroupName: "/aws/lambda/nhs-dev-callbacks-client-transform-filter",
  deliveryLogGroupPrefix: "/aws/lambda/nhs-dev-callbacks-https-client-",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGeneratePhaseLoad.mockResolvedValue(mockPhaseResult);
  mockQueryDeliveryMetricsSnapshot.mockResolvedValue(null);
  mockQueryCircuitBreakerSnapshot.mockResolvedValue(null);
  mockQueryPerClientRateTimeline.mockResolvedValue([]);
  immediateSleep.mockResolvedValue(undefined);
});

describe("runPerformanceTest", () => {
  it("returns a PerformanceResult with phase results and snapshots from polling and final query", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);
    mockQueryCircuitBreakerSnapshot.mockResolvedValue(mockCbSnapshot);

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-id-1",
      immediateSleep,
    );

    expect(result.testId).toBe("test-id-1");
    expect(result.scenario).toBe(scenario);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0]).toEqual(mockPhaseResult);
    expect(result.metrics).toHaveLength(2); // one mid-test, one final
    expect(result.deliveryMetrics).toHaveLength(2); // one mid-test, one final
    expect(result.circuitBreakerMetrics).toHaveLength(2); // one mid-test, one final
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
  });

  it("excludes null snapshots from the metrics array", async () => {
    mockQueryMetricsSnapshot
      .mockResolvedValueOnce(null) // mid-test poll returns null
      .mockResolvedValueOnce(mockSnapshot); // final query returns snapshot

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-id-2",
      immediateSleep,
    );

    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]).toEqual(mockSnapshot);
    expect(result.deliveryMetrics).toHaveLength(0);
    expect(result.circuitBreakerMetrics).toHaveLength(0);
  });

  it("produces an empty metrics array when all queries return null", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(null);

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-id-3",
      immediateSleep,
    );

    expect(result.metrics).toHaveLength(0);
    expect(result.deliveryMetrics).toHaveLength(0);
    expect(result.circuitBreakerMetrics).toHaveLength(0);
  });

  it("runs all phases and collects each result", async () => {
    const multiPhaseScenario: Scenario = {
      ...scenario,
      phases: [
        { durationSecs: 1, targetEps: 500 },
        { durationSecs: 1, targetEps: 1000 },
      ],
    };

    const phase1Result = { ...mockPhaseResult, targetEps: 500 };
    const phase2Result = { ...mockPhaseResult, targetEps: 1000 };

    mockGeneratePhaseLoad
      .mockResolvedValueOnce(phase1Result)
      .mockResolvedValueOnce(phase2Result);
    mockQueryMetricsSnapshot.mockResolvedValue(null);

    const result = await runPerformanceTest(
      deps,
      multiPhaseScenario,
      "test-id-4",
      immediateSleep,
    );

    expect(result.phases).toHaveLength(2);
    expect(result.phases[0]).toEqual(phase1Result);
    expect(result.phases[1]).toEqual(phase2Result);
  });

  it("collects delivery metrics across multiple poll iterations", async () => {
    let resolvePhase!: (value: PhaseResult) => void;
    mockGeneratePhaseLoad.mockImplementation(
      () =>
        new Promise<PhaseResult>((r) => {
          resolvePhase = r;
        }),
    );
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);

    let sleepCount = 0;
    const controlledSleep = jest.fn(async () => {
      sleepCount += 1;
      if (sleepCount >= 3) {
        resolvePhase(mockPhaseResult);
      }
    });

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-id-poll",
      controlledSleep,
    );

    expect(result.deliveryMetrics.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when scenario.eventMix is empty", async () => {
    const emptyMixScenario: Scenario = { ...scenario, eventMix: [] };

    await expect(
      runPerformanceTest(
        deps,
        emptyMixScenario,
        "empty-mix-test",
        immediateSleep,
      ),
    ).rejects.toThrow("scenario.eventMix must contain at least one entry");
  });

  it("throws when a phase has durationSecs of zero", async () => {
    const badScenario: Scenario = {
      ...scenario,
      phases: [{ durationSecs: 0, targetEps: 1000 }],
    };

    await expect(
      runPerformanceTest(
        deps,
        badScenario,
        "zero-duration-test",
        immediateSleep,
      ),
    ).rejects.toThrow("scenario.phases[0].durationSecs must be greater than 0");
  });

  it("throws when a phase has targetEps of zero", async () => {
    const badScenario: Scenario = {
      ...scenario,
      phases: [{ durationSecs: 1, targetEps: 0 }],
    };

    await expect(
      runPerformanceTest(deps, badScenario, "zero-eps-test", immediateSleep),
    ).rejects.toThrow("scenario.phases[0].targetEps must be greater than 0");
  });

  it("throws when a later phase has an invalid value", async () => {
    const badScenario: Scenario = {
      ...scenario,
      phases: [
        { durationSecs: 1, targetEps: 1000 },
        { durationSecs: 1, targetEps: 0 },
      ],
    };

    await expect(
      runPerformanceTest(deps, badScenario, "later-phase-test", immediateSleep),
    ).rejects.toThrow("scenario.phases[1].targetEps must be greater than 0");
  });

  it("calls generatePhaseLoad with the correct phase and deps", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(null);

    await runPerformanceTest(deps, scenario, "test-id-5", immediateSleep);

    expect(mockGeneratePhaseLoad).toHaveBeenCalledWith(
      deps.sqsClient,
      deps.queueUrl,
      scenario.phases[0],
      scenario.eventMix,
    );
  });

  it("skips delivery metrics when deliveryLogGroupPrefix is undefined", async () => {
    const depsWithoutPrefix: RunnerDeps = {
      ...deps,
      deliveryLogGroupPrefix: undefined,
    };
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);

    const result = await runPerformanceTest(
      depsWithoutPrefix,
      scenario,
      "test-id-6",
      immediateSleep,
    );

    expect(mockQueryDeliveryMetricsSnapshot).not.toHaveBeenCalled();
    expect(mockQueryCircuitBreakerSnapshot).not.toHaveBeenCalled();
    expect(result.deliveryMetrics).toHaveLength(0);
    expect(result.circuitBreakerMetrics).toHaveLength(0);
  });

  it("builds delivery log group names from prefix and event mix client IDs", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(null);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(null);

    const multiClientScenario: Scenario = {
      ...scenario,
      eventMix: [
        {
          weight: 1,
          factory: "messageStatus",
          clientId: "perf-client-1",
          messageStatus: "DELIVERED",
        },
        {
          weight: 1,
          factory: "channelStatus",
          clientId: "perf-client-2",
          channelStatus: "DELIVERED",
        },
      ],
    };

    await runPerformanceTest(
      deps,
      multiClientScenario,
      "test-id-7",
      immediateSleep,
    );

    expect(mockQueryDeliveryMetricsSnapshot).toHaveBeenCalledWith(
      deps.cloudWatchClient,
      expect.arrayContaining([
        "/aws/lambda/nhs-dev-callbacks-https-client-perf-client-1",
        "/aws/lambda/nhs-dev-callbacks-https-client-perf-client-2",
      ]),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("collects circuit breaker metrics when deliveryLogGroupPrefix is set", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);
    mockQueryCircuitBreakerSnapshot.mockResolvedValue(mockCbSnapshot);

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-cb-1",
      immediateSleep,
    );

    expect(result.circuitBreakerMetrics.length).toBeGreaterThanOrEqual(1);
    expect(mockQueryCircuitBreakerSnapshot).toHaveBeenCalled();
  });

  it("returns empty circuitBreakerMetrics when CB queries return null", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);
    mockQueryCircuitBreakerSnapshot.mockResolvedValue(null);

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-cb-null",
      immediateSleep,
    );

    expect(result.circuitBreakerMetrics).toHaveLength(0);
  });

  it("uses per-interval windowing for circuit breaker snapshots", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);
    mockQueryCircuitBreakerSnapshot.mockResolvedValue(mockCbSnapshot);

    let resolvePhase!: (value: PhaseResult) => void;
    mockGeneratePhaseLoad.mockImplementation(
      () =>
        new Promise<PhaseResult>((r) => {
          resolvePhase = r;
        }),
    );

    let sleepCount = 0;
    const controlledSleep = jest.fn(async () => {
      sleepCount += 1;
      if (sleepCount >= 3) {
        resolvePhase(mockPhaseResult);
      }
    });

    await runPerformanceTest(
      deps,
      scenario,
      "test-cb-interval",
      controlledSleep,
    );

    const cbCalls = mockQueryCircuitBreakerSnapshot.mock.calls;
    expect(cbCalls.length).toBeGreaterThanOrEqual(2);
    const firstCallEndSec = cbCalls[0][3];
    const secondCallStartSec = cbCalls[1][2];
    expect(secondCallStartSec).toBe(firstCallEndSec);
  });

  it("collects per-client rate timelines when deliveryLogGroupPrefix is set", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);
    mockQueryDeliveryMetricsSnapshot.mockResolvedValue(mockDeliverySnapshot);
    mockQueryPerClientRateTimeline.mockResolvedValue([
      { timestampSec: 1000, deliveryAttempts: 10 },
    ]);

    const result = await runPerformanceTest(
      deps,
      scenario,
      "test-pcr-1",
      immediateSleep,
    );

    expect(result.perClientRateTimelines).toHaveLength(1);
    expect(result.perClientRateTimelines![0].clientId).toBe("perf-client-1");
    expect(result.perClientRateTimelines![0].entries).toHaveLength(1);
  });

  it("queries each client log group individually for rate timelines", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(null);
    mockQueryPerClientRateTimeline.mockResolvedValue([
      { timestampSec: 1000, deliveryAttempts: 5 },
    ]);

    const multiClientScenario: Scenario = {
      ...scenario,
      eventMix: [
        {
          weight: 1,
          factory: "messageStatus",
          clientId: "perf-client-1",
          messageStatus: "DELIVERED",
        },
        {
          weight: 1,
          factory: "channelStatus",
          clientId: "perf-client-2",
          channelStatus: "DELIVERED",
        },
      ],
    };

    const result = await runPerformanceTest(
      deps,
      multiClientScenario,
      "test-pcr-multi",
      immediateSleep,
    );

    expect(mockQueryPerClientRateTimeline).toHaveBeenCalledTimes(2);
    expect(mockQueryPerClientRateTimeline).toHaveBeenCalledWith(
      deps.cloudWatchClient,
      "/aws/lambda/nhs-dev-callbacks-https-client-perf-client-1",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockQueryPerClientRateTimeline).toHaveBeenCalledWith(
      deps.cloudWatchClient,
      "/aws/lambda/nhs-dev-callbacks-https-client-perf-client-2",
      expect.any(Number),
      expect.any(Number),
    );
    expect(result.perClientRateTimelines).toHaveLength(2);
  });

  it("excludes clients with empty rate timelines", async () => {
    mockQueryMetricsSnapshot.mockResolvedValue(null);
    mockQueryPerClientRateTimeline
      .mockResolvedValueOnce([{ timestampSec: 1000, deliveryAttempts: 5 }])
      .mockResolvedValueOnce([]);

    const multiClientScenario: Scenario = {
      ...scenario,
      eventMix: [
        {
          weight: 1,
          factory: "messageStatus",
          clientId: "perf-client-1",
          messageStatus: "DELIVERED",
        },
        {
          weight: 1,
          factory: "channelStatus",
          clientId: "perf-client-2",
          channelStatus: "DELIVERED",
        },
      ],
    };

    const result = await runPerformanceTest(
      deps,
      multiClientScenario,
      "test-pcr-filter",
      immediateSleep,
    );

    expect(result.perClientRateTimelines).toHaveLength(1);
    expect(result.perClientRateTimelines![0].clientId).toBe("perf-client-1");
  });

  it("skips per-client rate timelines when deliveryLogGroupPrefix is undefined", async () => {
    const depsWithoutPrefix: RunnerDeps = {
      ...deps,
      deliveryLogGroupPrefix: undefined,
    };
    mockQueryMetricsSnapshot.mockResolvedValue(mockSnapshot);

    const result = await runPerformanceTest(
      depsWithoutPrefix,
      scenario,
      "test-pcr-skip",
      immediateSleep,
    );

    expect(mockQueryPerClientRateTimeline).not.toHaveBeenCalled();
    expect(result.perClientRateTimelines).toHaveLength(0);
  });
});

describe("defaultSleep", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("resolves after the specified delay", async () => {
    const promise = defaultSleep(500);
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeUndefined();
  });
});
