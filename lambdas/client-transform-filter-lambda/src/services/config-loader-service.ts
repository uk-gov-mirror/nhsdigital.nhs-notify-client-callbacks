import { S3Client } from "@aws-sdk/client-s3";
import { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";
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
  private loader: ConfigLoader | undefined;

  private cache: ConfigSubscriptionCache | undefined;

  private readonly ttlMs: number;

  constructor(cacheTtlMs: number = resolveCacheTtlMs()) {
    this.ttlMs = cacheTtlMs;
  }

  getLoader(): ConfigLoader {
    if (this.loader) {
      return this.loader;
    }

    this.cache = this.createCache(createS3Client());
    this.loader = new ConfigLoader(this.cache);
    return this.loader;
  }

  reset(s3Client?: S3Client): void {
    this.cache?.reset();
    this.loader = undefined;
    this.cache = undefined;
    if (s3Client) {
      this.cache = this.createCache(s3Client);
      this.loader = new ConfigLoader(this.cache);
    }
  }

  private createCache(s3Client: S3Client): ConfigSubscriptionCache {
    const bucketName = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    if (!bucketName) {
      throw new Error("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");
    }

    return new ConfigSubscriptionCache({
      s3Client,
      bucketName,
      keyPrefix:
        process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX ??
        "client_subscriptions/",
      ttlMs: this.ttlMs,
    });
  }
}
