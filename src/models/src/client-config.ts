import type { Channel } from "./channel-types";
import type {
  ChannelStatus,
  MessageStatus,
  SupplierStatus,
} from "./status-types";

export type ClientSubscriptionConfiguration = (
  | MessageStatusSubscriptionConfiguration
  | ChannelStatusSubscriptionConfiguration
)[];

interface SubscriptionConfigurationBase {
  SubscriptionId: string;
  ClientId: string;
  Targets: {
    Type: "API";
    TargetId: string;
    InvocationEndpoint: string;
    InvocationMethod: "POST";
    InvocationRateLimit: number;
    APIKey: {
      HeaderName: string;
      HeaderValue: string;
    };
  }[];
}

export interface MessageStatusSubscriptionConfiguration
  extends SubscriptionConfigurationBase {
  SubscriptionType: "MessageStatus";
  MessageStatuses: MessageStatus[];
}

export interface ChannelStatusSubscriptionConfiguration
  extends SubscriptionConfigurationBase {
  SubscriptionType: "ChannelStatus";
  ChannelType: Channel;
  ChannelStatuses: ChannelStatus[];
  SupplierStatuses: SupplierStatus[];
}
