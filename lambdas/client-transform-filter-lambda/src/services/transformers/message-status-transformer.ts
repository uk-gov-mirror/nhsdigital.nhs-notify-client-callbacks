import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type {
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientMessageStatus,
  MessageStatusAttributes,
} from "models/client-callback-payload";

export function transformMessageStatus(
  event: StatusTransitionEvent<MessageStatusData>,
): ClientCallbackPayload {
  const notifyData = event.data;
  const { messageId } = notifyData;
  const messageStatus =
    notifyData.messageStatus.toLowerCase() as ClientMessageStatus;
  const channels = notifyData.channels.map(
    (channel: { type: string; channelStatus: string }) => ({
      ...channel,
      type: channel.type.toLowerCase() as ClientChannel,
      channelStatus: channel.channelStatus.toLowerCase() as ClientChannelStatus,
    }),
  );

  const attributes: MessageStatusAttributes = {
    messageId: notifyData.messageId,
    messageReference: notifyData.messageReference,
    messageStatus,
    channels,
    timestamp: notifyData.timestamp,
    routingPlan: notifyData.routingPlan,
  };

  if (notifyData.messageStatusDescription) {
    attributes.messageStatusDescription = notifyData.messageStatusDescription;
  }

  if (notifyData.messageFailureReasonCode) {
    attributes.messageFailureReasonCode = notifyData.messageFailureReasonCode;
  }

  const payload: ClientCallbackPayload = {
    data: [
      {
        type: "MessageStatus",
        attributes,
        links: {
          message: `/v1/message-batches/messages/${messageId}`,
        },
        meta: {
          idempotencyKey: event.id,
        },
      },
    ],
  };

  return payload;
}
