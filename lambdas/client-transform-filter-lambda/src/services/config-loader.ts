import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { ConfigCache } from "@nhs-notify-client-callbacks/config-cache";
import { logger } from "services/logger";
import { wrapUnknownError } from "services/error-handler";
import {
  ConfigValidationError,
  validateClientConfig,
} from "services/validators/config-validator";

type ConfigLoaderOptions = {
  bucketName: string;
  keyPrefix: string;
  s3Client: S3Client;
  cache: ConfigCache;
};

function throwAsConfigError(error: unknown, clientId: string): never {
  if (error instanceof ConfigValidationError) {
    logger.error("Config validation failed with schema violations", {
      clientId,
      validationErrors: error.issues,
    });
    throw error;
  }

  const { message } = wrapUnknownError(error);
  logger.error("Failed to load config from S3", { clientId });
  throw new ConfigValidationError([{ path: "config", message }]);
}

export class ConfigLoader {
  constructor(private readonly options: ConfigLoaderOptions) {}

  async loadClientConfig(
    clientId: string,
  ): Promise<ClientSubscriptionConfiguration | undefined> {
    const cached = this.options.cache.get(clientId);
    if (cached) {
      logger.debug("Config loaded from cache", { clientId, cacheHit: true });
      return cached;
    }

    logger.debug("Config not in cache, fetching from S3", {
      clientId,
      cacheHit: false,
    });

    try {
      const response = await this.options.s3Client.send(
        new GetObjectCommand({
          Bucket: this.options.bucketName,
          Key: `${this.options.keyPrefix}${clientId}.json`,
        }),
      );

      if (!response.Body) {
        throw new Error("S3 response body was empty");
      }

      const rawConfig = await response.Body.transformToString();
      const parsedConfig = JSON.parse(rawConfig) as unknown;
      const validated = validateClientConfig(parsedConfig);
      this.options.cache.set(clientId, validated);
      logger.info("Config loaded successfully from S3", {
        clientId,
        subscriptionCount: validated.subscriptions.length,
      });
      return validated;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        logger.info(
          "No config found in S3 for client - events will be filtered out",
          { clientId },
        );
        return undefined;
      }
      throwAsConfigError(error, clientId);
      return undefined;
    }
  }
}
