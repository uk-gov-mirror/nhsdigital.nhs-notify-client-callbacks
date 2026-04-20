import { S3Client } from "@aws-sdk/client-s3";
import type { CallbackTarget } from "@nhs-notify-client-callbacks/models";
import { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";

const s3Client = new S3Client({});
let cache: ConfigSubscriptionCache | undefined;

function getCache(): ConfigSubscriptionCache {
  if (!cache) {
    const {
      CLIENT_SUBSCRIPTION_CONFIG_BUCKET,
      CLIENT_SUBSCRIPTION_CONFIG_PREFIX,
    } = process.env;
    if (!CLIENT_SUBSCRIPTION_CONFIG_BUCKET) {
      throw new Error("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");
    }

    const ttlMs =
      (Number(process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS) || 300) * 1000;

    cache = new ConfigSubscriptionCache({
      s3Client,
      bucketName: CLIENT_SUBSCRIPTION_CONFIG_BUCKET,
      keyPrefix: CLIENT_SUBSCRIPTION_CONFIG_PREFIX ?? "client_subscriptions/",
      ttlMs,
    });
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
  const clientConfig = await getCache().loadClientConfig(clientId);

  if (!clientConfig) {
    throw new Error(`No configuration found for client '${clientId}'`);
  }

  const target = clientConfig.targets.find((t) => t.targetId === targetId);

  if (!target) {
    throw new Error(
      `Target '${targetId}' not found in config for client '${clientId}'`,
    );
  }

  return target;
}
