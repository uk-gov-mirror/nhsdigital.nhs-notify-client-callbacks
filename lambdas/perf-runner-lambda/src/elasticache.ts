import { type RedisClientType, createClient } from "@redis/client";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { ElastiCacheDeps, EndpointRateLimitState } from "types";

const TOKEN_EXPIRY_SECONDS = 900;

async function generateIamToken(deps: ElastiCacheDeps): Promise<string> {
  const signer = new SignatureV4({
    credentials: fromNodeProviderChain(),
    region: deps.region,
    service: "elasticache",
    sha256: Sha256,
  });

  const signed = await signer.presign(
    {
      protocol: "https:",
      method: "GET",
      hostname: deps.cacheName,
      path: "/",
      query: { Action: "connect", User: deps.iamUsername },
      headers: { host: deps.cacheName },
    },
    { expiresIn: TOKEN_EXPIRY_SECONDS },
  );

  const qs = new URLSearchParams(
    signed.query as Record<string, string>,
  ).toString();
  return `${deps.cacheName}/?${qs}`;
}

export async function flushElastiCache(deps: ElastiCacheDeps): Promise<void> {
  const token = await generateIamToken(deps);

  const client: RedisClientType = createClient({
    url: `rediss://${deps.endpoint}:6379`,
    username: deps.iamUsername,
    password: token,
  });

  try {
    await client.connect();
    await client.flushAll();
  } finally {
    if (client.isOpen) {
      await client.disconnect();
    }
  }
}

const RATE_LIMIT_HASH_FIELDS = [
  "is_open",
  "switched_at",
  "bucket_tokens",
  "bucket_refilled_at",
  "cur_attempts",
  "prev_attempts",
  "cur_failures",
  "prev_failures",
  "sample_till",
] as const;

export async function dumpRateLimitState(
  deps: ElastiCacheDeps,
): Promise<EndpointRateLimitState[]> {
  const token = await generateIamToken(deps);

  const client: RedisClientType = createClient({
    url: `rediss://${deps.endpoint}:6379`,
    username: deps.iamUsername,
    password: token,
  });

  try {
    await client.connect();

    const keys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: "ep:*" })) {
      keys.push(key);
    }

    // eslint-disable-next-line sonarjs/null-dereference -- false positive: keys is string[]
    keys.sort((a, b) => a.localeCompare(b));
    const states: EndpointRateLimitState[] = [];
    for (const key of keys) {
      const values = await client.hmGet(key, [...RATE_LIMIT_HASH_FIELDS]);
      states.push({
        key,
        isOpen: values[0],
        switchedAt: values[1],
        bucketTokens: values[2],
        bucketRefilledAt: values[3],
        curAttempts: values[4],
        prevAttempts: values[5],
        curFailures: values[6],
        prevFailures: values[7],
        sampleTill: values[8],
      });
    }

    return states;
  } finally {
    if (client.isOpen) {
      await client.disconnect();
    }
  }
}
