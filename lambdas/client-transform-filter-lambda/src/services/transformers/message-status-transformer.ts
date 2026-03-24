import { createHash } from "node:crypto";
import type {
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientMessageStatus,
  MessageStatusAttributes,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

export function transformMessageStatus(
  event: StatusPublishEvent<MessageStatusData>,
  messageRootUri: string,
): ClientCallbackPayload {
  const { data } = event;
  const { messageId } = data;
  const messageStatus = data.messageStatus.toLowerCase() as ClientMessageStatus;
  const channels = data.channels.map(
    (channel: { type: string; channelStatus: string }) => ({
      ...channel,
      type: channel.type.toLowerCase() as ClientChannel,
      channelStatus: channel.channelStatus.toLowerCase() as ClientChannelStatus,
    }),
  );

  const idempotencyBody = {
    messageId,
    messageReference: data.messageReference,
    messageStatus,
    messageStatusDescription: data.messageStatusDescription,
    messageFailureReasonCode: data.messageFailureReasonCode,
    channels,
    routingPlan: data.routingPlan,
  };

  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify(idempotencyBody))
    .digest("hex");

  const attributes: MessageStatusAttributes = {
    messageId,
    messageReference: data.messageReference,
    messageStatus,
    channels,
    timestamp: data.timestamp,
    routingPlan: data.routingPlan,
  };

  if (data.messageStatusDescription) {
    attributes.messageStatusDescription = data.messageStatusDescription;
  }

  if (data.messageFailureReasonCode) {
    attributes.messageFailureReasonCode = data.messageFailureReasonCode;
  }

  const payload: ClientCallbackPayload = {
    data: [
      {
        type: "MessageStatus",
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
