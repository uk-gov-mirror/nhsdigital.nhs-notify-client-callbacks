import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  type CallbackTarget,
  parseClientSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import { ConfigCache } from "@nhs-notify-client-callbacks/config-cache";
import { logger } from "services/logger";

const s3Client = new S3Client({});
let cache: ConfigCache | undefined;

function getCache(): ConfigCache {
  if (!cache) {
    const ttlSeconds =
      Number(process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS) || 300;
    cache = new ConfigCache(ttlSeconds * 1000);
  }
  return cache;
}

export function resetCache(): void {
  cache = undefined;
}

export async function loadTargetConfig(
  clientId: string,
  targetId: string,
): Promise<CallbackTarget> {
  let clientConfig = getCache().get(clientId);

  if (!clientConfig) {
    const {
      CLIENT_SUBSCRIPTION_CONFIG_BUCKET,
      CLIENT_SUBSCRIPTION_CONFIG_PREFIX,
    } = process.env;
    if (!CLIENT_SUBSCRIPTION_CONFIG_BUCKET) {
      throw new Error("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");
    }

    const prefix = CLIENT_SUBSCRIPTION_CONFIG_PREFIX ?? "client_subscriptions/";

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: CLIENT_SUBSCRIPTION_CONFIG_BUCKET,
        Key: `${prefix}${clientId}.json`,
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 response body was empty for client '${clientId}'`);
    }

    const raw = await response.Body.transformToString();
    const parsed = JSON.parse(raw) as unknown;
    const result = parseClientSubscriptionConfiguration(parsed);

    if (!result.success) {
      throw new Error(
        `Invalid client config for '${clientId}': ${result.error.message}`,
      );
    }

    clientConfig = result.data;
    getCache().set(clientId, clientConfig);
    logger.info("Client config loaded from S3", { clientId });
  }

  const target = clientConfig.targets.find((t) => t.targetId === targetId);

  if (!target) {
    throw new Error(
      `Target '${targetId}' not found in config for client '${clientId}'`,
    );
  }

  return target;
}
