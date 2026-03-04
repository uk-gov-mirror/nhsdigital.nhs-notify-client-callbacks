import {
  type ChannelStatusAttributes,
  type ClientCallbackPayload,
  EventTypes,
  type MessageStatusAttributes,
} from "@nhs-notify-client-callbacks/models";
import type { Logger } from "services/logger";

function isMessageStatusAttributes(
  attributes: MessageStatusAttributes | ChannelStatusAttributes,
  eventType: string,
): attributes is MessageStatusAttributes {
  return eventType === EventTypes.MESSAGE_STATUS_PUBLISHED;
}

function isChannelStatusAttributes(
  attributes: MessageStatusAttributes | ChannelStatusAttributes,
  eventType: string,
): attributes is ChannelStatusAttributes {
  return eventType === EventTypes.CHANNEL_STATUS_PUBLISHED;
}

function buildMessageStatusLogFields(attrs: MessageStatusAttributes) {
  return {
    messageStatus: attrs.messageStatus,
    messageStatusDescription: attrs.messageStatusDescription,
    messageFailureReasonCode: attrs.messageFailureReasonCode,
    channels: attrs.channels,
  };
}

function buildChannelStatusLogFields(attrs: ChannelStatusAttributes) {
  return {
    channel: attrs.channel,
    channelStatus: attrs.channelStatus,
    channelStatusDescription: attrs.channelStatusDescription,
    channelFailureReasonCode: attrs.channelFailureReasonCode,
    supplierStatus: attrs.supplierStatus,
  };
}

export function logCallbackGenerated(
  eventLogger: Logger,
  payload: ClientCallbackPayload,
  eventType: string,
  correlationId: string | undefined,
  clientId: string,
): void {
  const { attributes } = payload.data[0];

  const commonFields = {
    correlationId,
    callbackType: payload.data[0].type,
    clientId,
    messageId: attributes.messageId,
    messageReference: attributes.messageReference,
  };

  let specificFields: Record<string, unknown>;

  if (isMessageStatusAttributes(attributes, eventType)) {
    specificFields = buildMessageStatusLogFields(attributes);
  } else if (isChannelStatusAttributes(attributes, eventType)) {
    specificFields = buildChannelStatusLogFields(attributes);
  } else {
    specificFields = {};
  }

  eventLogger.info("Callback generated", {
    ...commonFields,
    ...specificFields,
  });
}
