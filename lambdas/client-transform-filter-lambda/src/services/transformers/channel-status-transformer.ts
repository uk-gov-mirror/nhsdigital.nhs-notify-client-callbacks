import type { StatusTransitionEvent } from "models/status-transition-event";
import type { ChannelStatusData } from "models/channel-status-data";
import type {
  ChannelStatusAttributes,
  ClientCallbackPayload,
  ClientChannel,
  ClientChannelStatus,
  ClientSupplierStatus,
} from "models/client-callback-payload";

/**
 * Transforms a Channel Status Event from the Shared Event Bus format
 * to the client-facing JSON:API callback payload format.
 *
 * Extracts fields from notify-data section and constructs a JSON:API
 * compliant payload, excluding operational fields (clientId, previousChannelStatus, previousSupplierStatus).
 *
 * @param event - Status transition event with ChannelStatusData
 * @returns Client callback payload in JSON:API format
 */
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

  // Build attributes object with required fields
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

  // Include optional fields if present
  if (notifyData.channelStatusDescription) {
    attributes.channelStatusDescription = notifyData.channelStatusDescription;
  }

  if (notifyData.channelFailureReasonCode) {
    attributes.channelFailureReasonCode = notifyData.channelFailureReasonCode;
  }

  // Construct JSON:API payload
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
