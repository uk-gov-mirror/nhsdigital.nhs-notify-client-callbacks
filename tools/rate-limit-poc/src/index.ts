import { type RedisClientType, createClient } from "redis";
import { EndpointGate } from "src/endpoint-gate";

interface RunConfig {
  redisUrl: string;
  endpoint: string;
  concurrency: number;
  workers: number;
  capacity: number;
  refillPerSec: number;
  cooldownMs: number;
  decayPeriodMs: number;
  cbWindowPeriodMs: number;
  cbErrorThreshold: number;
  cbMinAttempts: number;
  cbProbeIntervalMs: number;
  successRate: number;
  minDelayMs: number;
  maxDelayMs: number;
  durationSecs: number;
}

interface RequestResult {
  admitOutcome: "allowed" | "probe" | "rate_limited" | "circuit_open";
  recordOutcome?: "success" | "failure";
  circuitOpened: boolean;
  effectiveRate: number;
}

interface WorkerStats {
  workerId: number;
  total: number;
  allowed: number;
  probes: number;
  rateLimited: number;
  circuitOpen: number;
  successRecorded: number;
  failureRecorded: number;
  circuitOpened: number;
  minEffectiveRate: number;
  maxEffectiveRate: number;
  durationMs: number;
}

function parseConfig(): RunConfig {
  const { env } = process;
  return {
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    endpoint: env.ENDPOINT ?? "test-endpoint",
    concurrency: Number(env.CONCURRENCY ?? "3000"),
    workers: Number(env.WORKERS ?? "1"),
    capacity: Number(env.CAPACITY ?? "100"),
    refillPerSec: Number(env.REFILL_PER_SEC ?? "20"),
    cooldownMs: Number(env.COOLDOWN_MS ?? "30000"),
    decayPeriodMs: Number(env.DECAY_PERIOD_MS ?? "300000"),
    cbWindowPeriodMs: Number(env.CB_WINDOW_PERIOD_MS ?? "60000"),
    cbErrorThreshold: Number(env.CB_ERROR_THRESHOLD ?? "0.5"),
    cbMinAttempts: Number(env.CB_MIN_ATTEMPTS ?? "10"),
    cbProbeIntervalMs: Number(env.CB_PROBE_INTERVAL_MS ?? "60000"),
    successRate: Number(env.SUCCESS_RATE ?? "0.9"),
    minDelayMs: Number(env.MIN_DELAY_MS ?? "5"),
    maxDelayMs: Number(env.MAX_DELAY_MS ?? "50"),
    durationSecs: Number(env.DURATION_SECS ?? "0"),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min; // NOSONAR — PoC only, not security-sensitive
}

async function runSingleRequest(
  gate: EndpointGate,
  config: RunConfig,
): Promise<RequestResult> {
  const result = await gate.admit();

  if (!result.allowed) {
    return {
      admitOutcome: result.reason,
      circuitOpened: false,
      effectiveRate: result.effectiveRate,
    };
  }

  const admitOutcome = result.probe ? "probe" : "allowed";

  await delay(randomInt(config.minDelayMs, config.maxDelayMs));

  const isSuccess = Math.random() > 1 - config.successRate; // NOSONAR — PoC only
  const outcome = isSuccess ? "success" : "failure";
  const recordResult = await gate.recordResult(outcome);

  return {
    admitOutcome,
    recordOutcome: outcome,
    circuitOpened: !recordResult.ok && recordResult.state === "opened",
    effectiveRate: result.effectiveRate,
  };
}

function summarize(
  workerId: number,
  results: RequestResult[],
  durationMs: number,
): WorkerStats {
  const effectiveRates = results
    .map((r) => r.effectiveRate)
    .filter((r) => r > 0);
  return {
    workerId,
    total: results.length,
    allowed: results.filter((r) => r.admitOutcome === "allowed").length,
    probes: results.filter((r) => r.admitOutcome === "probe").length,
    rateLimited: results.filter((r) => r.admitOutcome === "rate_limited")
      .length,
    circuitOpen: results.filter((r) => r.admitOutcome === "circuit_open")
      .length,
    successRecorded: results.filter((r) => r.recordOutcome === "success")
      .length,
    failureRecorded: results.filter((r) => r.recordOutcome === "failure")
      .length,
    circuitOpened: results.filter((r) => r.circuitOpened).length,
    minEffectiveRate:
      effectiveRates.length > 0 ? Math.min(...effectiveRates) : 0,
    maxEffectiveRate:
      effectiveRates.length > 0 ? Math.max(...effectiveRates) : 0,
    durationMs,
  };
}

async function runWorkerBurst(
  gate: EndpointGate,
  config: RunConfig,
): Promise<RequestResult[]> {
  const tasks = Array.from({ length: config.concurrency }, () =>
    runSingleRequest(gate, config),
  );
  return Promise.all(tasks);
}

async function runLane(
  gate: EndpointGate,
  config: RunConfig,
  deadline: number,
): Promise<RequestResult[]> {
  const results: RequestResult[] = [];
  while (Date.now() < deadline) {
    results.push(await runSingleRequest(gate, config));
  }
  return results;
}

async function runWorkerSustained(
  gate: EndpointGate,
  config: RunConfig,
): Promise<RequestResult[]> {
  const deadline = Date.now() + config.durationSecs * 1000;
  const lanes = Array.from({ length: config.concurrency }, () =>
    runLane(gate, config, deadline),
  );
  const laneResults = await Promise.all(lanes);
  return laneResults.flat();
}

async function runWorker(
  workerId: number,
  config: RunConfig,
): Promise<WorkerStats> {
  const redis = createClient({ url: config.redisUrl });
  await redis.connect();

  const gate = new EndpointGate(redis as RedisClientType, config.endpoint, {
    capacity: config.capacity,
    refillPerSec: config.refillPerSec,
    cooldownMs: config.cooldownMs,
    decayPeriodMs: config.decayPeriodMs,
    cbWindowPeriodMs: config.cbWindowPeriodMs,
    cbErrorThreshold: config.cbErrorThreshold,
    cbMinAttempts: config.cbMinAttempts,
    cbProbeIntervalMs: config.cbProbeIntervalMs,
  });

  const start = Date.now();

  const results =
    config.durationSecs > 0
      ? await runWorkerSustained(gate, config)
      : await runWorkerBurst(gate, config);

  const durationMs = Date.now() - start;

  await redis.quit();

  return summarize(workerId, results, durationMs);
}

function printWorkerStats(stats: WorkerStats): void {
  console.log(`\n  Worker ${stats.workerId}:`);
  console.log(`    Requests:     ${stats.total}`);
  console.log(`    Allowed:      ${stats.allowed}`);
  console.log(`    Probes:       ${stats.probes}`);
  console.log(`    Rate limited: ${stats.rateLimited}`);
  console.log(`    Circuit open: ${stats.circuitOpen}`);
  console.log(`    Success:      ${stats.successRecorded}`);
  console.log(`    Failure:      ${stats.failureRecorded}`);
  console.log(`    CB opened:    ${stats.circuitOpened}`);
  console.log(
    `    Eff. rate:    ${stats.minEffectiveRate}–${stats.maxEffectiveRate} req/s`,
  );
  console.log(`    Duration:     ${stats.durationMs}ms`);
  console.log(
    `    Throughput:   ${((stats.total / stats.durationMs) * 1000).toFixed(1)} calls/s (${((stats.allowed / stats.durationMs) * 1000).toFixed(1)} allowed/s)`,
  );
}

async function run(): Promise<void> {
  const config = parseConfig();

  const mode =
    config.durationSecs > 0
      ? `sustained (${config.durationSecs}s, ${config.concurrency} lanes/worker)`
      : `burst (${config.concurrency} requests/worker)`;
  console.log(`Rate-limit PoC — ${mode}`);
  console.log("Config:", JSON.stringify(config, null, 2));

  const setupRedis = createClient({ url: config.redisUrl });
  await setupRedis.connect();
  await setupRedis.del(`cb:{${config.endpoint}}`);
  await setupRedis.del(`rl:{${config.endpoint}}`);
  await setupRedis.quit();

  const start = Date.now();

  const workerTasks = Array.from({ length: config.workers }, (_, i) =>
    runWorker(i, config),
  );
  const allStats = await Promise.all(workerTasks);

  const totalDurationMs = Date.now() - start;

  console.log("\n--- Per-Worker Results ---");
  for (const stats of allStats) {
    printWorkerStats(stats);
  }

  const totalRequests = allStats.reduce((sum, s) => sum + s.total, 0);
  const totalAllowed = allStats.reduce((sum, s) => sum + s.allowed, 0);
  const totalProbes = allStats.reduce((sum, s) => sum + s.probes, 0);
  const totalRateLimited = allStats.reduce((sum, s) => sum + s.rateLimited, 0);
  const totalCircuitOpen = allStats.reduce((sum, s) => sum + s.circuitOpen, 0);
  const totalSuccess = allStats.reduce((sum, s) => sum + s.successRecorded, 0);
  const totalFailure = allStats.reduce((sum, s) => sum + s.failureRecorded, 0);
  const totalCbOpened = allStats.reduce((sum, s) => sum + s.circuitOpened, 0);

  console.log("\n--- Aggregate Results ---");
  console.log(`Workers:             ${config.workers}`);
  console.log(`Total requests:      ${totalRequests}`);
  console.log(`Total allowed:       ${totalAllowed}`);
  console.log(`Total probes:        ${totalProbes}`);
  console.log(`Total rate limited:  ${totalRateLimited}`);
  console.log(`Total circuit open:  ${totalCircuitOpen}`);
  console.log(`Total success:       ${totalSuccess}`);
  console.log(`Total failure:       ${totalFailure}`);
  console.log(`Total CB opened:     ${totalCbOpened}`);
  console.log(`Wall-clock duration: ${totalDurationMs}ms`);
  console.log(
    `Aggregate throughput: ${((totalRequests / totalDurationMs) * 1000).toFixed(1)} calls/s (${((totalAllowed / totalDurationMs) * 1000).toFixed(1)} allowed/s)`,
  );
}

run().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
