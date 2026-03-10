import { z } from "zod";
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  type Channel,
  type ChannelStatus,
  type ClientSubscriptionConfiguration,
  MESSAGE_STATUSES,
  type MessageStatus,
  SUPPLIER_STATUSES,
  type SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import type { SubscriptionBuilder } from "src/domain/client-subscription-builder";
import { S3Repository } from "src/repository/s3";

export type MessageStatusSubscriptionArgs = {
  clientName: string;
  clientId: string;
  apiKey: string;
  apiEndpoint: string;
  statuses: MessageStatus[];
  rateLimit: number;
  dryRun: boolean;
  apiKeyHeaderName?: string;
};

const messageStatusSubscriptionArgsSchema = z.object({
  clientName: z.string(),
  clientId: z.string(),
  apiKey: z.string(),
  apiEndpoint: z.string(),
  statuses: z.array(z.enum(MESSAGE_STATUSES)),
  rateLimit: z.number(),
  dryRun: z.boolean(),
  apiKeyHeaderName: z.string().optional().default("x-api-key"),
});

export type ChannelStatusSubscriptionArgs = {
  clientName: string;
  clientId: string;
  apiKey: string;
  apiEndpoint: string;
  channelStatuses?: ChannelStatus[];
  supplierStatuses?: SupplierStatus[];
  channelType: Channel;
  rateLimit: number;
  dryRun: boolean;
  apiKeyHeaderName?: string;
};

const channelStatusSubscriptionArgsSchema = z.object({
  clientName: z.string(),
  clientId: z.string(),
  apiKey: z.string(),
  apiEndpoint: z.string(),
  channelStatuses: z.array(z.enum(CHANNEL_STATUSES)).min(1).optional(),
  supplierStatuses: z.array(z.enum(SUPPLIER_STATUSES)).min(1).optional(),
  channelType: z.enum(CHANNEL_TYPES),
  rateLimit: z.number(),
  dryRun: z.boolean(),
  apiKeyHeaderName: z.string().optional().default("x-api-key"),
});

export class ClientSubscriptionRepository {
  constructor(
    private readonly s3Repository: S3Repository,
    private readonly configurationBuilder: SubscriptionBuilder,
  ) {}

  async getClientSubscriptions(
    clientId: string,
  ): Promise<ClientSubscriptionConfiguration | undefined> {
    const rawFile = await this.s3Repository.getObject(
      `client_subscriptions/${clientId}.json`,
    );

    if (rawFile !== undefined) {
      return JSON.parse(rawFile) as unknown as ClientSubscriptionConfiguration;
    }
    return undefined;
  }

  async putMessageStatusSubscription(
    subscriptionArgs: MessageStatusSubscriptionArgs,
  ) {
    const parsedSubscriptionArgs =
      messageStatusSubscriptionArgsSchema.parse(subscriptionArgs);

    const { clientId } = parsedSubscriptionArgs;
    const subscriptions = (await this.getClientSubscriptions(clientId)) ?? [];

    const indexOfMessageStatusSubscription = subscriptions.findIndex(
      (subscription) => subscription.SubscriptionType === "MessageStatus",
    );

    if (indexOfMessageStatusSubscription !== -1) {
      subscriptions.splice(indexOfMessageStatusSubscription, 1);
    }

    const messageStatusConfig = this.configurationBuilder.messageStatus(
      parsedSubscriptionArgs,
    );

    const newConfigFile: ClientSubscriptionConfiguration = [
      ...subscriptions,
      messageStatusConfig,
    ];

    if (!parsedSubscriptionArgs.dryRun) {
      await this.s3Repository.putRawData(
        JSON.stringify(newConfigFile),
        `client_subscriptions/${clientId}.json`,
      );
    }

    return newConfigFile;
  }

  async putChannelStatusSubscription(
    subscriptionArgs: ChannelStatusSubscriptionArgs,
  ): Promise<ClientSubscriptionConfiguration> {
    const parsedSubscriptionArgs =
      channelStatusSubscriptionArgsSchema.parse(subscriptionArgs);

    if (
      !parsedSubscriptionArgs.channelStatuses?.length &&
      !parsedSubscriptionArgs.supplierStatuses?.length
    ) {
      throw new Error(
        "Validation failed: at least one of channelStatuses or supplierStatuses must be provided",
      );
    }

    const { clientId } = parsedSubscriptionArgs;
    const subscriptions = (await this.getClientSubscriptions(clientId)) ?? [];

    const indexOfChannelStatusSubscription = subscriptions.findIndex(
      (subscription) =>
        subscription.SubscriptionType === "ChannelStatus" &&
        subscription.ChannelType === parsedSubscriptionArgs.channelType,
    );

    if (indexOfChannelStatusSubscription !== -1) {
      subscriptions.splice(indexOfChannelStatusSubscription, 1);
    }

    const channelStatusConfig = this.configurationBuilder.channelStatus(
      parsedSubscriptionArgs,
    );

    const newConfigFile: ClientSubscriptionConfiguration = [
      ...subscriptions,
      channelStatusConfig,
    ];

    if (!parsedSubscriptionArgs.dryRun) {
      await this.s3Repository.putRawData(
        JSON.stringify(newConfigFile),
        `client_subscriptions/${clientId}.json`,
      );
    }

    return newConfigFile;
  }
}
