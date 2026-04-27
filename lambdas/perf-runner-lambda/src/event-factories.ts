import type {
  ChannelStatus,
  ChannelStatusData,
  MessageStatus,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import type { EventMixEntry } from "types";

export function createMessageStatusEvent(
  clientId: string,
  messageStatus: MessageStatus,
  forcedStatusCode?: number,
  forcedStatusCodeUntilMs?: number,
): StatusPublishEvent<MessageStatusData> {
  const uuid = crypto.randomUUID();
  const messageId =
    forcedStatusCode !== undefined
      ? forcedStatusCodeUntilMs !== undefined
        ? `force-${forcedStatusCode}-until-${forcedStatusCodeUntilMs}-${uuid}`
        : `force-${forcedStatusCode}-${uuid}`
      : uuid;

  const data: MessageStatusData = {
    clientId,
    messageId,
    messageReference: `ref-${crypto.randomUUID()}`,
    messageStatus,
    channels: [{ type: "NHSAPP", channelStatus: "DELIVERED" }],
    timestamp: new Date().toISOString(),
    routingPlan: {
      id: crypto.randomUUID(),
      name: "perf-test-routing-plan",
      version: "v1.0.0",
      createdDate: new Date().toISOString(),
    },
  };

  return {
    specversion: "1.0",
    id: crypto.randomUUID(),
    source: "/nhs/england/notify/development/primary/data-plane/messaging",
    subject: `customer/${crypto.randomUUID()}/message/${messageId}`,
    type: EventTypes.MESSAGE_STATUS_PUBLISHED,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema:
      "https://notify.nhs.uk/schemas/message-status-published-v1.json",
    traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
    data,
  };
}

export function createChannelStatusEvent(
  clientId: string,
  channelStatus: ChannelStatus,
  forcedStatusCode?: number,
  forcedStatusCodeUntilMs?: number,
): StatusPublishEvent<ChannelStatusData> {
  const uuid = crypto.randomUUID();
  const messageId =
    forcedStatusCode !== undefined
      ? forcedStatusCodeUntilMs !== undefined
        ? `force-${forcedStatusCode}-until-${forcedStatusCodeUntilMs}-${uuid}`
        : `force-${forcedStatusCode}-${uuid}`
      : uuid;

  const data: ChannelStatusData = {
    clientId,
    messageId,
    messageReference: `ref-${crypto.randomUUID()}`,
    channel: "NHSAPP",
    channelStatus,
    supplierStatus: "delivered",
    cascadeType: "primary",
    cascadeOrder: 0,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };

  return {
    specversion: "1.0",
    id: crypto.randomUUID(),
    source: "/nhs/england/notify/development/primary/data-plane/messaging",
    subject: `customer/${crypto.randomUUID()}/message/${messageId}`,
    type: EventTypes.CHANNEL_STATUS_PUBLISHED,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema:
      "https://notify.nhs.uk/schemas/channel-status-published-v1.json",
    traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
    data,
  };
}

export function createEvent(entry: EventMixEntry): StatusPublishEvent {
  if (entry.factory === "messageStatus") {
    return createMessageStatusEvent(
      entry.clientId,
      entry.messageStatus,
      entry.forcedStatusCode,
      entry.forcedStatusCodeUntilMs,
    );
  }

  return createChannelStatusEvent(
    entry.clientId,
    entry.channelStatus,
    entry.forcedStatusCode,
    entry.forcedStatusCodeUntilMs,
  );
}
