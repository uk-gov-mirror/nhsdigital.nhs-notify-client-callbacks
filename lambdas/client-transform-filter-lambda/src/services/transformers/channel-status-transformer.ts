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
  const { data } = event;
  const { messageId } = data;
  const channel = data.channel.toLowerCase() as ClientChannel;
  const channelStatus = data.channelStatus.toLowerCase() as ClientChannelStatus;
  const supplierStatus =
    data.supplierStatus.toLowerCase() as ClientSupplierStatus;

  const idempotencyBody = {
    messageId,
    messageReference: data.messageReference,
    cascadeType: data.cascadeType,
    cascadeOrder: data.cascadeOrder,
    channel,
    channelStatus,
    channelStatusDescription: data.channelStatusDescription,
    channelFailureReasonCode: data.channelFailureReasonCode,
    supplierStatus,
    retryCount: data.retryCount,
  };

  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify(idempotencyBody))
    .digest("hex");

  const attributes: ChannelStatusAttributes = {
    messageId,
    messageReference: data.messageReference,
    channel,
    channelStatus,
    supplierStatus,
    cascadeType: data.cascadeType,
    cascadeOrder: data.cascadeOrder,
    timestamp: data.timestamp,
    retryCount: data.retryCount,
  };

  if (data.channelStatusDescription) {
    attributes.channelStatusDescription = data.channelStatusDescription;
  }

  if (data.channelFailureReasonCode) {
    attributes.channelFailureReasonCode = data.channelFailureReasonCode;
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
