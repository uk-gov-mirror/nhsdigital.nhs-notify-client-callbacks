import type { RedisClientType } from "services/redis-client";
import { createHash } from "node:crypto";
import admitLuaSrc from "services/admit.lua";
import recordResultLuaSrc from "services/record-result.lua";

export type AdmitResultAllowed = {
  allowed: true;
  consumedTokens: number;
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
  | { ok: true; state: "ok" | "closed" }
  | { ok: false; state: "opened" | "failed" };

export type EndpointGateConfig = {
  burstCapacity: number;
  probeRateLimit: number;
  recoveryPeriodMs: number;
  samplePeriodMs: number;
  failureThreshold: number;
  minAttempts: number;
  cooldownPeriodMs: number;
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
): Promise<unknown> {
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
      throw new Error(
        `Redis error in script ${script}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    return client.sendCommand(["EVAL", script, keyCount, ...keys, ...args]);
  }
}

export async function admit(
  client: RedisClientType,
  targetId: string,
  refillPerSec: number,
  cbEnabled: boolean,
  targetBatchSize: number,
  config: EndpointGateConfig,
): Promise<AdmitResult> {
  const epKey = `ep:{${targetId}}`;
  const now = Date.now().toString();
  const probeRate = cbEnabled ? config.probeRateLimit.toString() : "0";

  const args = [
    now,
    config.burstCapacity.toString(),
    String(refillPerSec),
    config.cooldownPeriodMs.toString(),
    config.recoveryPeriodMs.toString(),
    probeRate,
    String(targetBatchSize),
  ];

  if (!admitSha) {
    admitSha = computeSha1(admitLuaSrc);
  }

  const raw = (await evalScript(
    client,
    admitLuaSrc,
    admitSha,
    [epKey],
    args,
  )) as [number, string, number, number];

  const [consumedOrFlag, reason, retryAfterMs, effectiveRate] = raw;

  if (reason === "allowed" || reason === "probe") {
    return {
      allowed: true,
      consumedTokens: Number(consumedOrFlag),
      effectiveRate: Number(effectiveRate),
    };
  }

  return {
    allowed: false,
    reason: reason as "circuit_open" | "rate_limited",
    retryAfterMs: Number(retryAfterMs),
    effectiveRate: Number(effectiveRate),
  };
}

export async function recordResult(
  client: RedisClientType,
  targetId: string,
  consumedTokens: number,
  processingFailures: number,
  config: EndpointGateConfig,
): Promise<RecordResultOutcome> {
  const epKey = `ep:{${targetId}}`;
  const now = Date.now().toString();

  const args = [
    now,
    String(consumedTokens),
    String(processingFailures),
    config.cooldownPeriodMs.toString(),
    config.recoveryPeriodMs.toString(),
    config.failureThreshold.toString(),
    config.minAttempts.toString(),
    config.samplePeriodMs.toString(),
  ];

  if (!recordResultSha) {
    recordResultSha = computeSha1(recordResultLuaSrc);
  }

  const raw = (await evalScript(
    client,
    recordResultLuaSrc,
    recordResultSha,
    [epKey],
    args,
  )) as [number, string];

  const [ok, state] = raw;

  if (ok === 1) {
    return { ok: true, state: "closed" };
  }

  return { ok: false, state: state as "opened" | "failed" };
}

export function resetAdmitSha(): void {
  admitSha = undefined;
  recordResultSha = undefined;
}
