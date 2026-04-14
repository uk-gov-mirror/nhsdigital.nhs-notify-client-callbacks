import type { Channel } from "./channel-types";
import type {
  ChannelStatus,
  MessageStatus,
  SupplierStatus,
} from "./status-types";

export type CallbackTarget = {
  targetId: string;
  type: "API";
  invocationEndpoint: string;
  invocationMethod: "POST";
  invocationRateLimit: number;
  apiKey: {
    headerName: string;
    headerValue: string;
  };
  mtls: {
    enabled: boolean;
  };
  certPinning: {
    enabled: boolean;
    spkiHash?: string;
  };
  delivery?: {
    maxRetryDurationSeconds?: number;
    circuitBreaker?: {
      enabled: boolean;
    };
  };
};

type SubscriptionConfigurationBase = {
  subscriptionId: string;
  targetIds: string[];
};

export type MessageStatusSubscriptionConfiguration =
  SubscriptionConfigurationBase & {
    subscriptionType: "MessageStatus";
    messageStatuses: MessageStatus[];
  };

export type ChannelStatusSubscriptionConfiguration =
  SubscriptionConfigurationBase & {
    subscriptionType: "ChannelStatus";
    channelType: Channel;
    channelStatuses: ChannelStatus[];
    supplierStatuses: SupplierStatus[];
  };

export type SubscriptionConfiguration =
  | MessageStatusSubscriptionConfiguration
  | ChannelStatusSubscriptionConfiguration;

export type ClientSubscriptionConfiguration = {
  clientId: string;
  subscriptions: SubscriptionConfiguration[];
  targets: CallbackTarget[];
};
