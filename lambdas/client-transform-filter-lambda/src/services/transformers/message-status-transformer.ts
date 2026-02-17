import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type {
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientMessageStatus,
  MessageStatusAttributes,
} from "models/client-callback-payload";

/**
 * Transforms a Message Status Event from the Shared Event Bus format
 * to the client-facing JSON:API callback payload format.
 *
 * Extracts fields from notify-data section and constructs a JSON:API
 * compliant payload, excluding operational fields (clientId, previousMessageStatus).
 *
 * @param event - Status transition event with MessageStatusData
 * @returns Client callback payload in JSON:API format
 */
export function transformMessageStatus(
  event: StatusTransitionEvent<MessageStatusData>,
): ClientCallbackPayload {
  const notifyData = event.data["notify-payload"]["notify-data"];
  const { messageId } = notifyData;
  const messageStatus =
    notifyData.messageStatus.toLowerCase() as ClientMessageStatus;
  const channels = notifyData.channels.map((channel) => ({
    ...channel,
    type: channel.type.toLowerCase() as ClientChannel,
    channelStatus: channel.channelStatus.toLowerCase() as ClientChannelStatus,
  }));

  // Build attributes object with required fields
  const attributes: MessageStatusAttributes = {
    messageId: notifyData.messageId,
    messageReference: notifyData.messageReference,
    messageStatus,
    channels,
    timestamp: notifyData.timestamp,
    routingPlan: notifyData.routingPlan,
  };

  // Include optional fields if present
  if (notifyData.messageStatusDescription) {
    attributes.messageStatusDescription = notifyData.messageStatusDescription;
  }

  if (notifyData.messageFailureReasonCode) {
    attributes.messageFailureReasonCode = notifyData.messageFailureReasonCode;
  }

  // Construct JSON:API payload
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
