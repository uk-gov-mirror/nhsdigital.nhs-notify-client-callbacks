import type { RedisClientType } from "services/redis-client";
import { createHash } from "node:crypto";
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
  | { ok: false; state: "opened" | "failed" };

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
  config: EndpointGateConfig,
): Promise<AdmitResult> {
  const cbKey = `cb:{${targetId}}`;
  const rlKey = `rl:{${targetId}}`;
  const now = Date.now().toString();
  const probeIntervalMs = cbEnabled ? config.cbProbeIntervalMs.toString() : "0";

  const args = [
    now,
    config.burstCapacity.toString(),
    // eslint-disable-next-line sonarjs/null-dereference
    refillPerSec.toString(),
    config.cbCooldownMs.toString(),
    config.decayPeriodMs.toString(),
    config.cbWindowPeriodMs.toString(),
    probeIntervalMs,
  ];

  if (!admitSha) {
    admitSha = computeSha1(admitLuaSrc);
  }

  const raw = (await evalScript(
    client,
    admitLuaSrc,
    admitSha,
    [cbKey, rlKey],
    args,
  )) as [number, string, number, number];

  const [allowed, reason, retryAfterMs, effectiveRate] = raw;

  if (allowed === 1) {
    return {
      allowed: true,
      probe: reason === "probe",
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
  success: boolean,
  config: EndpointGateConfig,
): Promise<RecordResultOutcome> {
  const cbKey = `cb:{${targetId}}`;
  const now = Date.now().toString();

  const args = [
    now,
    success ? "1" : "0",
    config.cbCooldownMs.toString(),
    config.decayPeriodMs.toString(),
    config.cbErrorThreshold.toString(),
    config.cbMinAttempts.toString(),
    config.cbWindowPeriodMs.toString(),
  ];

  if (!recordResultSha) {
    recordResultSha = computeSha1(recordResultLuaSrc);
  }

  const raw = (await evalScript(
    client,
    recordResultLuaSrc,
    recordResultSha,
    [cbKey],
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
