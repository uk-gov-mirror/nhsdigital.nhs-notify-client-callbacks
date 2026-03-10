import { S3Client } from "@aws-sdk/client-s3";
import { ConfigCache } from "services/config-cache";
import { ConfigLoader } from "services/config-loader";

const DEFAULT_CACHE_TTL_SECONDS = 60;

export const resolveCacheTtlMs = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const configuredTtlSeconds = Number.parseInt(
    env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS ?? `${DEFAULT_CACHE_TTL_SECONDS}`,
    10,
  );
  const cacheTtlSeconds = Number.isFinite(configuredTtlSeconds)
    ? configuredTtlSeconds
    : DEFAULT_CACHE_TTL_SECONDS;
  return cacheTtlSeconds * 1000;
};

export const createS3Client = (
  env: NodeJS.ProcessEnv = process.env,
): S3Client => {
  const endpoint = env.AWS_ENDPOINT_URL;
  const forcePathStyle = endpoint?.includes("localhost") ? true : undefined;
  return new S3Client({ endpoint, forcePathStyle });
};

export class ConfigLoaderService {
  private readonly cache: ConfigCache;

  private loader: ConfigLoader | undefined;

  constructor(cacheTtlMs: number = resolveCacheTtlMs()) {
    this.cache = new ConfigCache(cacheTtlMs);
  }

  getLoader(): ConfigLoader {
    const bucketName = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    if (!bucketName) {
      throw new Error("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");
    }

    if (this.loader) {
      return this.loader;
    }

    this.loader = new ConfigLoader({
      bucketName,
      keyPrefix:
        process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX ??
        "client_subscriptions/",
      s3Client: createS3Client(),
      cache: this.cache,
    });

    return this.loader;
  }

  reset(s3Client?: S3Client): void {
    this.loader = undefined;
    this.cache.clear();
    if (s3Client) {
      const bucketName = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
      if (!bucketName) {
        throw new Error("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");
      }
      this.loader = new ConfigLoader({
        bucketName,
        keyPrefix:
          process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX ??
          "client_subscriptions/",
        s3Client,
        cache: this.cache,
      });
    }
  }
}
