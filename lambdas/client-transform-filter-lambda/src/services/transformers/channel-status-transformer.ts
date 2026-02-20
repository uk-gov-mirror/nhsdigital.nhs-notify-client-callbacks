import type { StatusTransitionEvent } from "models/status-transition-event";
import type { ChannelStatusData } from "models/channel-status-data";
import type {
  ChannelStatusAttributes,
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientSupplierStatus,
} from "models/client-callback-payload";

export function transformChannelStatus(
  event: StatusTransitionEvent<ChannelStatusData>,
): ClientCallbackPayload {
  const notifyData = event.data;
  const { messageId } = notifyData;
  const channel = notifyData.channel.toLowerCase() as ClientChannel;
  const channelStatus =
    notifyData.channelStatus.toLowerCase() as ClientChannelStatus;
  const supplierStatus =
    notifyData.supplierStatus.toLowerCase() as ClientSupplierStatus;

  const attributes: ChannelStatusAttributes = {
    messageId: notifyData.messageId,
    messageReference: notifyData.messageReference,
    channel,
    channelStatus,
    supplierStatus,
    cascadeType: notifyData.cascadeType,
    cascadeOrder: notifyData.cascadeOrder,
    timestamp: notifyData.timestamp,
    retryCount: notifyData.retryCount,
  };

  if (notifyData.channelStatusDescription) {
    attributes.channelStatusDescription = notifyData.channelStatusDescription;
  }

  if (notifyData.channelFailureReasonCode) {
    attributes.channelFailureReasonCode = notifyData.channelFailureReasonCode;
  }

  const payload: ClientCallbackPayload = {
    data: [
      {
        type: "ChannelStatus",
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
