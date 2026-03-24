import type {
  CallbackTarget,
  Channel,
  ChannelStatus,
  ChannelStatusSubscriptionConfiguration,
  MessageStatus,
  MessageStatusSubscriptionConfiguration,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";

export type BuildTargetArgs = {
  apiEndpoint: string;
  apiKey: string;
  apiKeyHeaderName?: string;
  rateLimit: number;
};

export type BuildMessageStatusSubscriptionArgs = {
  subscriptionId: string;
  targetIds: string[];
  messageStatuses: MessageStatus[];
};

export type BuildChannelStatusSubscriptionArgs = {
  subscriptionId: string;
  targetIds: string[];
  channelType: Channel;
  channelStatuses?: ChannelStatus[];
  supplierStatuses?: SupplierStatus[];
};

export function buildTarget(args: BuildTargetArgs): CallbackTarget {
  return {
    targetId: crypto.randomUUID(),
    type: "API",
    invocationEndpoint: args.apiEndpoint,
    invocationMethod: "POST",
    invocationRateLimit: args.rateLimit,
    apiKey: {
      headerName: args.apiKeyHeaderName ?? "x-api-key",
      headerValue: args.apiKey,
    },
  };
}

export function buildMessageStatusSubscription(
  args: BuildMessageStatusSubscriptionArgs,
): MessageStatusSubscriptionConfiguration {
  return {
    subscriptionId: args.subscriptionId,
    subscriptionType: "MessageStatus",
    targetIds: args.targetIds,
    messageStatuses: args.messageStatuses,
  };
}

export function buildChannelStatusSubscription(
  args: BuildChannelStatusSubscriptionArgs,
): ChannelStatusSubscriptionConfiguration {
  return {
    subscriptionId: args.subscriptionId,
    subscriptionType: "ChannelStatus",
    targetIds: args.targetIds,
    channelType: args.channelType,
    channelStatuses: args.channelStatuses ?? [],
    supplierStatuses: args.supplierStatuses ?? [],
  };
}
