import { normalizeClientName } from "src/entrypoint/cli/helper";
import type {
  ChannelStatusSubscriptionArgs,
  MessageStatusSubscriptionArgs,
} from "src/repository/client-subscriptions";
import type {
  ChannelStatusSubscriptionConfiguration,
  MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";

export type SubscriptionBuilder = {
  messageStatus(
    args: MessageStatusSubscriptionArgs,
  ): MessageStatusSubscriptionConfiguration;
  channelStatus(
    args: ChannelStatusSubscriptionArgs,
  ): ChannelStatusSubscriptionConfiguration;
};

export function buildMessageStatusSubscription(
  args: MessageStatusSubscriptionArgs,
): MessageStatusSubscriptionConfiguration {
  const {
    apiEndpoint,
    apiKey,
    apiKeyHeaderName = "x-api-key",
    clientId,
    clientName,
    rateLimit,
    statuses,
  } = args;
  const normalizedClientName = normalizeClientName(clientName);
  const subscriptionId = normalizedClientName;
  return {
    SubscriptionId: subscriptionId,
    SubscriptionType: "MessageStatus",
    ClientId: clientId,
    MessageStatuses: statuses,
    Targets: [
      {
        Type: "API",
        TargetId: crypto.randomUUID(),
        InvocationEndpoint: apiEndpoint,
        InvocationMethod: "POST",
        InvocationRateLimit: rateLimit,
        APIKey: {
          HeaderName: apiKeyHeaderName,
          HeaderValue: apiKey,
        },
      },
    ],
  };
}

export function buildChannelStatusSubscription(
  args: ChannelStatusSubscriptionArgs,
): ChannelStatusSubscriptionConfiguration {
  const {
    apiEndpoint,
    apiKey,
    apiKeyHeaderName = "x-api-key",
    channelStatuses,
    channelType,
    clientId,
    clientName,
    rateLimit,
    supplierStatuses,
  } = args;
  const normalizedClientName = normalizeClientName(clientName);
  const subscriptionId = `${normalizedClientName}-${channelType}`;
  return {
    SubscriptionId: subscriptionId,
    SubscriptionType: "ChannelStatus",
    ClientId: clientId,
    ChannelType: channelType,
    ChannelStatuses: channelStatuses ?? [],
    SupplierStatuses: supplierStatuses ?? [],
    Targets: [
      {
        Type: "API",
        TargetId: crypto.randomUUID(),
        InvocationEndpoint: apiEndpoint,
        InvocationMethod: "POST",
        InvocationRateLimit: rateLimit,
        APIKey: {
          HeaderName: apiKeyHeaderName,
          HeaderValue: apiKey,
        },
      },
    ],
  };
}

export const clientSubscriptionBuilder: SubscriptionBuilder = {
  messageStatus: buildMessageStatusSubscription,
  channelStatus: buildChannelStatusSubscription,
};
