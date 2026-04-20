import { type RedisClientType, createClient } from "@redis/client";
import { createHash } from "node:crypto";
import { logger } from "@nhs-notify-client-callbacks/logger";
import admitLuaSrc from "services/admit.lua";
import recordResultLuaSrc from "services/record-result.lua";

export type AdmitResultAllowed = {
  allowed: true;
  probe: boolean;
  effectiveRate: number;
};

export type AdmitResultDenied = {
  allowed: false;
  reason: "circuit_open" | "rate_limited";
  retryAfterMs: number;
  effectiveRate: number;
};

export type AdmitResult = AdmitResultAllowed | AdmitResultDenied;

export type RecordResultOutcome =
  | { ok: true; state: "closed" }
  | { ok: false; state: "opened" };

export type EndpointGateConfig = {
  burstCapacity: number;
  cbProbeIntervalMs: number;
  decayPeriodMs: number;
  cbWindowPeriodMs: number;
  cbErrorThreshold: number;
  cbMinAttempts: number;
  cbCooldownMs: number;
};

let admitSha: string | undefined;
let recordResultSha: string | undefined;

function computeSha1(script: string): string {
  // eslint-disable-next-line sonarjs/hashing -- SHA-1 required by Redis EVALSHA protocol, not a security context
  return createHash("sha1").update(script).digest("hex");
}

async function evalScript(
  client: RedisClientType,
  script: string,
  sha: string,
  keys: string[],
  args: string[],
): Promise<string> {
  const keyCount = keys.length.toString();
  try {
    return await client.sendCommand([
      "EVALSHA",
      sha,
      keyCount,
      ...keys,
      ...args,
    ]);
  } catch (error: unknown) {
    const isNoScript =
      error instanceof Error && error.message.includes("NOSCRIPT");
    if (!isNoScript) {
      throw error;
    }
    return client.sendCommand(["EVAL", script, keyCount, ...keys, ...args]);
  }
}

export async function admit(
  client: RedisClientType,
  targetId: string,
  refillPerSec: number,
  cbEnabled: boolean,
  config: EndpointGateConfig,
): Promise<AdmitResult> {
  const rlKey = `rl:${targetId}`;
  const cbKey = `cb:${targetId}`;
  const now = Date.now().toString();

  /* eslint-disable sonarjs/null-dereference -- refillPerSec is typed as number, cannot be null */
  const args = [
    now,
    refillPerSec.toString(),
    config.burstCapacity.toString(),
    config.cbProbeIntervalMs.toString(),
    cbEnabled ? "1" : "0",
    config.decayPeriodMs.toString(),
  ];
  /* eslint-enable sonarjs/null-dereference */

  if (!admitSha) {
    admitSha = computeSha1(admitLuaSrc);
  }

  const result = await evalScript(
    client,
    admitLuaSrc,
    admitSha,
    [rlKey, cbKey],
    args,
  );

  return JSON.parse(result) as AdmitResult;
}

export async function recordResult(
  client: RedisClientType,
  targetId: string,
  success: boolean,
  config: EndpointGateConfig,
): Promise<RecordResultOutcome> {
  const cbKey = `cb:${targetId}`;
  const now = Date.now().toString();

  const args = [
    now,
    success ? "1" : "0",
    config.cbWindowPeriodMs.toString(),
    config.cbErrorThreshold.toString(),
    config.cbMinAttempts.toString(),
    config.cbCooldownMs.toString(),
    config.decayPeriodMs.toString(),
  ];

  if (!recordResultSha) {
    recordResultSha = computeSha1(recordResultLuaSrc);
  }

  const result = await evalScript(
    client,
    recordResultLuaSrc,
    recordResultSha,
    [cbKey],
    args,
  );

  return JSON.parse(result) as RecordResultOutcome;
}

export function resetAdmitSha(): void {
  admitSha = undefined;
  recordResultSha = undefined;
}

let redisClient: RedisClientType | undefined;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  const endpoint = process.env.ELASTICACHE_ENDPOINT;
  if (!endpoint) {
    throw new Error("ELASTICACHE_ENDPOINT is required");
  }

  redisClient = createClient({ url: `rediss://${endpoint}:6379` });
  redisClient.on("error", (err) => {
    logger.error("Redis connection error", { error: String(err) });
  });

  await redisClient.connect();
  return redisClient;
}

export function resetRedisClient(): void {
  redisClient = undefined;
}
