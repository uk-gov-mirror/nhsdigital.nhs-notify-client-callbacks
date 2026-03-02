import type {
  ChannelStatusAttributes,
  ChannelStatusData,
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientSupplierStatus,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

export function transformChannelStatus(
  event: StatusPublishEvent<ChannelStatusData>,
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
