import type {
  CallbackTarget,
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  MessageStatusSubscriptionConfiguration,
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
  invocationEndpoint: "https://example.com/webhook",
  invocationMethod: "POST",
  invocationRateLimit: 10,
  apiKey: {
    headerName: "x-api-key",
    headerValue: "secret",
    ...overrides.apiKey,
  },
  mtls: { enabled: false },
  certPinning: { enabled: false },
  ...overrides,
});

export const createMessageStatusSubscription = (
  overrides: Partial<MessageStatusSubscriptionConfiguration> = {},
): MessageStatusSubscriptionConfiguration => ({
  subscriptionId: "sub-001",
  subscriptionType: "MessageStatus",
  messageStatuses: ["DELIVERED"],
  targetIds: [DEFAULT_TARGET_ID],
  ...overrides,
});

export const createChannelStatusSubscription = (
  overrides: Partial<ChannelStatusSubscriptionConfiguration> = {},
): ChannelStatusSubscriptionConfiguration => ({
  subscriptionId: "sub-002",
  subscriptionType: "ChannelStatus",
  channelType: "SMS",
  channelStatuses: ["DELIVERED"],
  supplierStatuses: ["delivered"],
  targetIds: [DEFAULT_TARGET_ID],
  ...overrides,
});

export const createClientSubscriptionConfig = (
  overrides: Partial<ClientSubscriptionConfiguration> = {},
): ClientSubscriptionConfiguration => ({
  clientId: "client-1",
  subscriptions: [],
  targets: [],
  ...overrides,
});

export const createPopulatedClientSubscriptionConfig = (
  clientId = "client-1",
): ClientSubscriptionConfiguration =>
  createClientSubscriptionConfig({
    clientId,
    subscriptions: [
      createMessageStatusSubscription(),
      createChannelStatusSubscription(),
    ],
    targets: [createTarget()],
  });
