import {
  type CallbackTarget,
  type ChannelStatus,
  type ClientSubscriptionConfiguration,
  type MessageStatus,
  type SubscriptionConfiguration,
  type SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import { validateClientConfig } from "src/domain/client-config-validator";
import { S3Repository } from "src/repository/s3";

const CLIENT_SUBSCRIPTIONS_PREFIX = "client_subscriptions/";

const parseStoredConfig = (
  clientId: string,
  rawFile: string,
): ClientSubscriptionConfiguration => {
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(rawFile) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse stored config for client ${clientId}: ${String(error)}`,
    );
  }

  return validateClientConfig(parsedConfig);
};

// eslint-disable-next-line import-x/prefer-default-export
export class ClientSubscriptionRepository {
  constructor(private readonly s3Repository: S3Repository) {}

  async listClientIds(): Promise<string[]> {
    const keys = await this.s3Repository.listObjectKeys(
      CLIENT_SUBSCRIPTIONS_PREFIX,
    );
    return keys
      .map((key) =>
        String(key)
          .replace(CLIENT_SUBSCRIPTIONS_PREFIX, "")
          .replace(/\.json$/, ""),
      )
      .filter(Boolean);
  }

  async getClientConfig(
    clientId: string,
  ): Promise<ClientSubscriptionConfiguration | undefined> {
    const rawFile = await this.s3Repository.getObject(
      `${CLIENT_SUBSCRIPTIONS_PREFIX}${clientId}.json`,
    );

    if (rawFile !== undefined) {
      return parseStoredConfig(clientId, rawFile);
    }
    return undefined;
  }

  async putClientConfig(
    clientId: string,
    config: ClientSubscriptionConfiguration,
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const validatedConfig = validateClientConfig(config);

    if (!dryRun) {
      await this.s3Repository.putRawData(
        JSON.stringify(validatedConfig),
        `${CLIENT_SUBSCRIPTIONS_PREFIX}${clientId}.json`,
      );
    }
    return validatedConfig;
  }

  async addSubscription(
    clientId: string,
    subscription: SubscriptionConfiguration,
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const config = (await this.getClientConfig(clientId)) ?? {
      clientId,
      subscriptions: [],
      targets: [],
    };
    config.subscriptions.push(subscription);
    return this.putClientConfig(clientId, config, dryRun);
  }

  async deleteSubscription(
    clientId: string,
    subscriptionId: string,
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const config = await this.getClientConfig(clientId);
    if (!config) {
      throw new Error(`No configuration found for client: ${clientId}`);
    }
    const exists = config.subscriptions.some(
      (s) => s.subscriptionId === subscriptionId,
    );
    if (!exists) {
      console.warn(
        `Warning: subscription ${subscriptionId} not found for client ${clientId}`,
      );
    }
    const updated: ClientSubscriptionConfiguration = {
      ...config,
      subscriptions: config.subscriptions.filter(
        (s) => s.subscriptionId !== subscriptionId,
      ),
    };
    return this.putClientConfig(clientId, updated, dryRun);
  }

  async setSubscriptionStates(
    clientId: string,
    subscriptionId: string,
    states: {
      messageStatuses?: MessageStatus[];
      channelStatuses?: ChannelStatus[];
      supplierStatuses?: SupplierStatus[];
    },
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const config = await this.getClientConfig(clientId);
    if (!config) {
      throw new Error(`No configuration found for client: ${clientId}`);
    }
    const updated: ClientSubscriptionConfiguration = {
      ...config,
      subscriptions: config.subscriptions.map(
        (sub): SubscriptionConfiguration => {
          if (sub.subscriptionId !== subscriptionId) return sub;
          if (sub.subscriptionType === "MessageStatus") {
            return {
              ...sub,
              ...(states.messageStatuses && {
                messageStatuses: states.messageStatuses,
              }),
            } as SubscriptionConfiguration;
          }
          if (sub.subscriptionType === "ChannelStatus") {
            return {
              ...sub,
              ...(states.channelStatuses && {
                channelStatuses: states.channelStatuses,
              }),
              ...(states.supplierStatuses && {
                supplierStatuses: states.supplierStatuses,
              }),
            } as SubscriptionConfiguration;
          }
          return sub;
        },
      ),
    };
    return this.putClientConfig(clientId, updated, dryRun);
  }

  async addTarget(
    clientId: string,
    target: CallbackTarget,
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const config = (await this.getClientConfig(clientId)) ?? {
      clientId,
      subscriptions: [],
      targets: [],
    };
    config.targets.push(target);
    return this.putClientConfig(clientId, config, dryRun);
  }

  async deleteTarget(
    clientId: string,
    targetId: string,
    dryRun: boolean,
  ): Promise<ClientSubscriptionConfiguration> {
    const config = await this.getClientConfig(clientId);
    if (!config) {
      throw new Error(`No configuration found for client: ${clientId}`);
    }

    const exists = config.targets.some((t) => t.targetId === targetId);
    if (!exists) {
      console.warn(
        `Warning: target ${targetId} not found for client ${clientId}`,
      );
    }

    const referencingSubscriptionIds = config.subscriptions
      .filter((subscription) =>
        (subscription.targetIds as readonly string[]).includes(targetId),
      )
      .map((subscription) => subscription.subscriptionId);

    if (referencingSubscriptionIds.length > 0) {
      throw new Error(
        `Cannot delete target ${targetId}: still referenced by subscriptions ${referencingSubscriptionIds.join(", ")}`,
      );
    }

    const updated: ClientSubscriptionConfiguration = {
      ...config,
      targets: config.targets.filter((t) => t.targetId !== targetId),
    };
    return this.putClientConfig(clientId, updated, dryRun);
  }
}
