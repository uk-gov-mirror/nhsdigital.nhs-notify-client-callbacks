import type {
  CallbackTarget,
  Channel,
  ChannelStatus,
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  MessageStatus,
  MessageStatusSubscriptionConfiguration,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";

export const DEFAULT_TARGET_ID = "00000000-0000-4000-8000-000000000001";

type TargetOverrides = Partial<CallbackTarget> & {
  apiKey?: Partial<CallbackTarget["apiKey"]>;
};

export const createTarget = (
  overrides: TargetOverrides = {},
): CallbackTarget => ({
  targetId: DEFAULT_TARGET_ID,
  type: "API",
  invocationEndpoint: "https://example.com",
  invocationMethod: "POST",
  invocationRateLimit: 10,
  apiKey: {
    headerName: "x-api-key",
    headerValue: "secret",
    ...overrides.apiKey,
  },
  ...overrides,
});

export const createMessageStatusSubscription = (
  statuses: MessageStatus[] = ["DELIVERED"],
  overrides: Partial<MessageStatusSubscriptionConfiguration> = {},
): MessageStatusSubscriptionConfiguration => ({
  subscriptionId: "00000000-0000-0000-0000-000000000001",
  subscriptionType: "MessageStatus",
  messageStatuses: statuses,
  targetIds: [DEFAULT_TARGET_ID],
  ...overrides,
});

export const createChannelStatusSubscription = (
  channelStatuses: ChannelStatus[] = ["DELIVERED"],
  supplierStatuses: SupplierStatus[] = ["delivered"],
  channelType: Channel = "EMAIL",
  overrides: Partial<ChannelStatusSubscriptionConfiguration> = {},
): ChannelStatusSubscriptionConfiguration => ({
  subscriptionId: "00000000-0000-0000-0000-000000000002",
  subscriptionType: "ChannelStatus",
  channelType,
  channelStatuses,
  supplierStatuses,
  targetIds: [DEFAULT_TARGET_ID],
  ...overrides,
});

export const createClientSubscriptionConfig = (
  clientId = "client-1",
  overrides: Partial<ClientSubscriptionConfiguration> = {},
): ClientSubscriptionConfiguration => ({
  clientId,
  subscriptions: [],
  targets: [],
  ...overrides,
});

export const createMessageStatusConfig = (
  statuses: MessageStatus[] = ["DELIVERED"],
  clientId = "client-1",
): ClientSubscriptionConfiguration =>
  createClientSubscriptionConfig(clientId, {
    subscriptions: [createMessageStatusSubscription(statuses)],
    targets: [createTarget()],
  });

export const createChannelStatusConfig = (
  channelStatuses: ChannelStatus[] = ["DELIVERED"],
  supplierStatuses: SupplierStatus[] = ["delivered"],
  clientId = "client-1",
  channelType: Channel = "EMAIL",
): ClientSubscriptionConfiguration =>
  createClientSubscriptionConfig(clientId, {
    subscriptions: [
      createChannelStatusSubscription(
        channelStatuses,
        supplierStatuses,
        channelType,
      ),
    ],
    targets: [createTarget()],
  });
