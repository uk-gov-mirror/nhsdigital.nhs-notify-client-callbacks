import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";

export function createMessageStatusPublishEvent(
  overrides?: Partial<MessageStatusData>,
): StatusPublishEvent<MessageStatusData> {
  const messageId = overrides?.messageId ?? crypto.randomUUID();
  const messageReference =
    overrides?.messageReference ?? `ref-${crypto.randomUUID()}`;

  const data: MessageStatusData = {
    clientId: "mock-client-1",
    messageId,
    messageReference,
    messageStatus: "DELIVERED",
    channels: [{ type: "NHSAPP", channelStatus: "DELIVERED" }],
    timestamp: new Date().toISOString(),
    routingPlan: {
      id: crypto.randomUUID(),
      name: "perf-test-routing-plan",
      version: "v1.0.0",
      createdDate: new Date().toISOString(),
    },
    ...overrides,
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

export function createChannelStatusPublishEvent(
  overrides?: Partial<ChannelStatusData>,
): StatusPublishEvent<ChannelStatusData> {
  const messageId = overrides?.messageId ?? crypto.randomUUID();
  const messageReference =
    overrides?.messageReference ?? `ref-${crypto.randomUUID()}`;

  const data: ChannelStatusData = {
    clientId: "mock-client-1",
    messageId,
    messageReference,
    channel: "NHSAPP",
    channelStatus: "DELIVERED",
    channelStatusDescription: "perf-test",
    supplierStatus: "delivered",
    cascadeType: "primary",
    cascadeOrder: 0,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
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
