import type {
  ChannelStatusAttributes,
  ClientCallbackPayload,
  MessageStatusAttributes,
} from "@nhs-notify-client-callbacks/models";

function extractAttributes<T>(payload: ClientCallbackPayload): T {
  return payload.data[0].attributes as T;
}

export function extractMessageStatusAttributes(
  payload: ClientCallbackPayload,
): MessageStatusAttributes {
  return extractAttributes<MessageStatusAttributes>(payload);
}

export function extractChannelStatusAttributes(
  payload: ClientCallbackPayload,
): ChannelStatusAttributes {
  return extractAttributes<ChannelStatusAttributes>(payload);
}
