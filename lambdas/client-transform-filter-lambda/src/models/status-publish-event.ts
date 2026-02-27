import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";

export interface StatusPublishEvent<T = MessageStatusData | ChannelStatusData> {
  specversion: string;
  id: string;
  source: string;
  subject: string;
  type: string;
  time: string;
  sequence?: string;
  datacontenttype: string;
  dataschema: string;
  traceparent: string;

  data: T;
}

export const EventTypes = {
  MESSAGE_STATUS_PUBLISHED: "uk.nhs.notify.message.status.PUBLISHED.v1",
  CHANNEL_STATUS_PUBLISHED: "uk.nhs.notify.channel.status.PUBLISHED.v1",
} as const;

export { type MessageStatusData } from "models/message-status-data";

export { type ChannelStatusData } from "models/channel-status-data";
