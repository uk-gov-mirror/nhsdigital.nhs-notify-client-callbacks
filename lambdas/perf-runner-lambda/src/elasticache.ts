import { type RedisClientType, createClient } from "@redis/client";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { ElastiCacheDeps } from "types";

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
