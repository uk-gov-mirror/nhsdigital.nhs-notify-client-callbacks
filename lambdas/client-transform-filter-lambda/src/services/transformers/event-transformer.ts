import {
  type ChannelStatusData,
  type ClientCallbackPayload,
  EventTypes,
  type MessageStatusData,
  type StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { TransformationError } from "services/error-handler";
import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import { transformMessageStatus } from "services/transformers/message-status-transformer";

export function transformEvent(
  rawEvent: StatusPublishEvent,
  correlationId: string | undefined,
): ClientCallbackPayload {
  const eventType = rawEvent.type;

  if (eventType === EventTypes.MESSAGE_STATUS_PUBLISHED) {
    const typedEvent = rawEvent as StatusPublishEvent<MessageStatusData>;
    return transformMessageStatus(typedEvent);
  }

  if (eventType === EventTypes.CHANNEL_STATUS_PUBLISHED) {
    const typedEvent = rawEvent as StatusPublishEvent<ChannelStatusData>;
    return transformChannelStatus(typedEvent);
  }

  throw new TransformationError(
    `Unsupported event type: ${eventType}`,
    correlationId,
  );
}
