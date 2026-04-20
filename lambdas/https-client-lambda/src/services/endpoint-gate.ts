import { type RedisClientType, createClient } from "@redis/client";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
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
  const cbKey = `cb:${targetId}`;
  const rlKey = `rl:${targetId}`;
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
  const cbKey = `cb:${targetId}`;
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

const TOKEN_EXPIRY_SECONDS = 900;
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

let redisClient: RedisClientType | undefined;
let tokenExpiry = 0;

async function generateElastiCacheIamToken(): Promise<string> {
  const cacheName = process.env.ELASTICACHE_CACHE_NAME;
  const endpoint = process.env.ELASTICACHE_ENDPOINT;
  const username = process.env.ELASTICACHE_IAM_USERNAME;

  if (!cacheName || !endpoint || !username) {
    throw new Error(
      "ELASTICACHE_CACHE_NAME, ELASTICACHE_ENDPOINT, and ELASTICACHE_IAM_USERNAME are required",
    );
  }

  const region = process.env.AWS_REGION ?? "eu-west-2";

  const signer = new SignatureV4({
    credentials: fromNodeProviderChain(),
    region,
    service: "elasticache",
    sha256: Sha256,
  });

  const signed = await signer.presign(
    {
      protocol: "https:",
      method: "GET",
      hostname: endpoint,
      path: "/",
      query: { Action: "connect", User: username },
      headers: { host: endpoint },
    },
    { expiresIn: TOKEN_EXPIRY_SECONDS },
  );

  tokenExpiry = Date.now() + TOKEN_EXPIRY_SECONDS * 1000;

  const qs = new URLSearchParams(
    signed.query as Record<string, string>,
  ).toString();
  return `https://${signed.hostname}${signed.path}?${qs}`;
}

export async function getRedisClient(): Promise<RedisClientType> {
  const isTokenValid =
    tokenExpiry > Date.now() + TOKEN_REFRESH_BUFFER_SECONDS * 1000;

  if (redisClient?.isOpen && isTokenValid) {
    return redisClient;
  }

  const endpoint = process.env.ELASTICACHE_ENDPOINT;
  if (!endpoint) {
    throw new Error("ELASTICACHE_ENDPOINT is required");
  }

  const username = process.env.ELASTICACHE_IAM_USERNAME;
  if (!username) {
    throw new Error("ELASTICACHE_IAM_USERNAME is required");
  }

  if (redisClient?.isOpen) {
    await redisClient.disconnect();
  }

  const token = await generateElastiCacheIamToken();

  redisClient = createClient({
    url: `rediss://${endpoint}:6379`,
    username,
    password: token,
  });

  redisClient.on("error", (err) => {
    logger.error("Redis connection error", { error: String(err) });
  });

  await redisClient.connect();
  return redisClient;
}

export function resetRedisClient(): void {
  redisClient = undefined;
  tokenExpiry = 0;
}
