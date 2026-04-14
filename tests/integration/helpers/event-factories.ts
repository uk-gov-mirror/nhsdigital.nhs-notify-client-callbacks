import type {
  ChannelStatusData,
  ClientCallbackPayload,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";

import { getMockItClientConfig } from "./mock-client-config";

type MessageEventOverrides = {
  event?: Partial<StatusPublishEvent<MessageStatusData>>;
  data?: Partial<MessageStatusData>;
};

type ChannelEventOverrides = {
  event?: Partial<StatusPublishEvent<ChannelStatusData>>;
  data?: Partial<ChannelStatusData>;
};

type DeliveryMessage = {
  payload: ClientCallbackPayload;
  subscriptions: string[];
  targetId: string;
};

export function createDeliveryMessage(
  overrides?: Partial<DeliveryMessage>,
): DeliveryMessage {
  const config = getMockItClientConfig();
  const targetId =
    overrides?.targetId ?? config.targets[0]?.targetId ?? "target-001";

  return {
    payload:
      overrides?.payload ??
      ({
        data: [
          {
            type: "MessageStatus",
            attributes: { messageStatus: "delivered" },
            links: { message: "https://api.example.invalid/messages/msg-001" },
            meta: { idempotencyKey: crypto.randomUUID() },
          },
        ],
      } as ClientCallbackPayload),
    subscriptions: overrides?.subscriptions ?? ["sub-001"],
    targetId,
  };
}

export function createMessageStatusPublishEvent(
  overrides?: MessageEventOverrides,
): StatusPublishEvent<MessageStatusData> {
  const messageId = overrides?.data?.messageId ?? crypto.randomUUID();
  const messageReference =
    overrides?.data?.messageReference ?? `ref-${crypto.randomUUID()}`;

  const baseData: MessageStatusData = {
    clientId: getMockItClientConfig().clientId,
    messageId,
    messageReference,
    messageStatus: "DELIVERED",
    messageStatusDescription: "Integration test message delivered",
    channels: [
      {
        type: "NHSAPP",
        channelStatus: "DELIVERED",
      },
    ],
    timestamp: new Date().toISOString(),
    routingPlan: {
      id: `routing-plan-${crypto.randomUUID()}`,
      name: "Test routing plan",
      version: "v1.0.0",
      createdDate: new Date().toISOString(),
    },
  };

  const event: StatusPublishEvent<MessageStatusData> = {
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
    data: {
      ...baseData,
      ...overrides?.data,
    },
  };

  return {
    ...event,
    ...overrides?.event,
    data: {
      ...event.data,
      ...overrides?.data,
    },
  };
}

export function createChannelStatusPublishEvent(
  overrides?: ChannelEventOverrides,
): StatusPublishEvent<ChannelStatusData> {
  const messageId = overrides?.data?.messageId ?? crypto.randomUUID();
  const messageReference =
    overrides?.data?.messageReference ?? `ref-${crypto.randomUUID()}`;

  const baseData: ChannelStatusData = {
    clientId: getMockItClientConfig().clientId,
    messageId,
    messageReference,
    channel: "NHSAPP",
    channelStatus: "DELIVERED",
    channelStatusDescription: "Integration test channel delivered",
    supplierStatus: "delivered",
    cascadeType: "primary",
    cascadeOrder: 1,
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };

  const event: StatusPublishEvent<ChannelStatusData> = {
    specversion: "1.0",
    id: crypto.randomUUID(),
    source: "/nhs/england/notify/development/primary/data-plane/messaging",
    subject: `customer/${crypto.randomUUID()}/message/${messageId}/channel/nhsapp`,
    type: EventTypes.CHANNEL_STATUS_PUBLISHED,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema:
      "https://notify.nhs.uk/schemas/channel-status-published-v1.json",
    traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-02",
    data: {
      ...baseData,
      ...overrides?.data,
    },
  };

  return {
    ...event,
    ...overrides?.event,
    data: {
      ...event.data,
      ...overrides?.data,
    },
  };
}
