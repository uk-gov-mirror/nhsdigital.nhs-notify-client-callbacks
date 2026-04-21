import { type RedisClientType, createClient } from "@redis/client";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { logger } from "@nhs-notify-client-callbacks/logger";

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

export { type RedisClientType } from "@redis/client";
