import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { parseClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { logger } from "@nhs-notify-client-callbacks/logger";

type CacheEntry = {
  value: ClientSubscriptionConfiguration;
  expiresAt: number;
};

export type ConfigSubscriptionCacheOptions = {
  s3Client: S3Client;
  bucketName: string;
  keyPrefix: string;
  ttlMs: number;
};

export class ConfigSubscriptionCache {
  private readonly cache = new Map<string, CacheEntry>();

  private readonly s3Client: S3Client;

  private readonly bucketName: string;

  private readonly keyPrefix: string;

  private readonly ttlMs: number;

  constructor(options: ConfigSubscriptionCacheOptions) {
    this.s3Client = options.s3Client;
    this.bucketName = options.bucketName;
    this.keyPrefix = options.keyPrefix;
    this.ttlMs = options.ttlMs;
  }

  async loadClientConfig(
    clientId: string,
  ): Promise<ClientSubscriptionConfiguration | undefined> {
    const cached = this.getCached(clientId);
    if (cached) {
      return cached;
    }

    const raw = await this.fetchFromS3(clientId);
    if (raw === undefined) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as unknown;
    const result = parseClientSubscriptionConfiguration(parsed);

    if (!result.success) {
      throw new Error(
        `Invalid client config for '${clientId}': ${result.error.message}`,
      );
    }

    this.cache.set(clientId, {
      value: result.data,
      expiresAt: Date.now() + this.ttlMs,
    });

    logger.info("Client config loaded from S3", { clientId });
    return result.data;
  }

  reset(): void {
    this.cache.clear();
  }

  // eslint-disable-next-line sonarjs/function-return-type -- cache lookup returns T | undefined
  private getCached(
    clientId: string,
  ): ClientSubscriptionConfiguration | undefined {
    const entry = this.cache.get(clientId);

    if (entry && entry.expiresAt <= Date.now()) {
      this.cache.delete(clientId);
      return undefined;
    }

    return entry?.value;
  }

  private async fetchFromS3(clientId: string): Promise<string | undefined> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: `${this.keyPrefix}${clientId}.json`,
        }),
      );

      if (!response.Body) {
        throw new Error(`S3 response body was empty for client '${clientId}'`);
      }

      return await response.Body.transformToString();
    } catch (error) {
      if (error instanceof NoSuchKey) {
        logger.info(
          "No config found in S3 for client — events will be filtered out",
          { clientId },
        );
        return undefined;
      }
      throw error;
    }
  }
}
