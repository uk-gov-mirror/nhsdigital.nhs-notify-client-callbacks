import type { RoutingPlan } from "./routing-plan";
import type { Channel } from "./channel-types";
import type { MessageStatus } from "./status-types";

export interface MessageStatusData {
  messageId: string;
  messageReference: string;
  messageStatus: MessageStatus;
  messageStatusDescription?: string;
  messageFailureReasonCode?: string;
  channels: {
    type: Channel;
    channelStatus: string;
  }[];
  timestamp: string;
  routingPlan: RoutingPlan;

  clientId: string;
  previousMessageStatus?: MessageStatus;
}
