import type {
  ChannelStatusData,
  ClientCallbackPayload,
  MessageStatusData,
  StatusTransitionEvent,
} from "models";
import { EventTypes } from "models";
import { TransformationError } from "services/error-handler";
import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import { transformMessageStatus } from "services/transformers/message-status-transformer";

export function transformEvent(
  rawEvent: StatusTransitionEvent,
  correlationId: string | undefined,
): ClientCallbackPayload {
  const eventType = rawEvent.type;

  if (eventType === EventTypes.MESSAGE_STATUS_TRANSITIONED) {
    const typedEvent = rawEvent as StatusTransitionEvent<MessageStatusData>;
    return transformMessageStatus(typedEvent);
  }

  if (eventType === EventTypes.CHANNEL_STATUS_TRANSITIONED) {
    const typedEvent = rawEvent as StatusTransitionEvent<ChannelStatusData>;
    return transformChannelStatus(typedEvent);
  }

  throw new TransformationError(
    `Unsupported event type: ${eventType}`,
    correlationId,
  );
}
