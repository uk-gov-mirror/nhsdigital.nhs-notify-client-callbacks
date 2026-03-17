import { createHash } from "node:crypto";
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
  messageRootUri: string,
): ClientCallbackPayload {
  const notifyData = event.data;
  const { messageId } = notifyData;
  const channel = notifyData.channel.toLowerCase() as ClientChannel;
  const channelStatus =
    notifyData.channelStatus.toLowerCase() as ClientChannelStatus;
  const supplierStatus =
    notifyData.supplierStatus.toLowerCase() as ClientSupplierStatus;

  const idempotencyBody = {
    messageId,
    messageReference: notifyData.messageReference,
    cascadeType: notifyData.cascadeType,
    cascadeOrder: notifyData.cascadeOrder,
    channel,
    channelStatus,
    channelStatusDescription: notifyData.channelStatusDescription,
    channelFailureReasonCode: notifyData.channelFailureReasonCode,
    supplierStatus,
    retryCount: notifyData.retryCount,
  };

  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify(idempotencyBody))
    .digest("hex");

  const attributes: ChannelStatusAttributes = {
    messageId,
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
          message: `${messageRootUri}/messages/${messageId}`,
        },
        meta: {
          idempotencyKey,
        },
      },
    ],
  };

  return payload;
}
