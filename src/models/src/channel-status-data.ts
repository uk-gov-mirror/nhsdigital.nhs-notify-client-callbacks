import type { Channel } from "./channel-types";
import type { ChannelStatus, SupplierStatus } from "./status-types";

export interface ChannelStatusData {
  messageId: string;
  messageReference: string;
  channel: Channel;
  channelStatus: ChannelStatus;
  channelStatusDescription?: string;
  channelFailureReasonCode?: string;
  supplierStatus: SupplierStatus;
  cascadeType: "primary" | "secondary";
  cascadeOrder: number;
  timestamp: string;
  retryCount: number;

  clientId: string;
  previousChannelStatus?: ChannelStatus;
  previousSupplierStatus?: SupplierStatus;
}
