import type {
  ChannelStatusData,
  ClientSubscriptionConfiguration,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import { matchesChannelStatusSubscription } from "services/filters/channel-status-filter";
import { matchesMessageStatusSubscription } from "services/filters/message-status-filter";
import { TransformationError } from "services/error-handler";
import { logger } from "services/logger";

type FilterResult = {
  matched: boolean;
  subscriptionType: "MessageStatus" | "ChannelStatus" | "Unknown";
};

export const evaluateSubscriptionFilters = (
  event: StatusPublishEvent,
  config: ClientSubscriptionConfiguration | undefined,
): FilterResult => {
  if (!config) {
    logger.debug("No config available for filtering", {
      eventType: event.type,
    });
    return { matched: false, subscriptionType: "Unknown" };
  }

  if (event.type === EventTypes.MESSAGE_STATUS_PUBLISHED) {
    const notifyData = event.data as MessageStatusData;
    return {
      matched: matchesMessageStatusSubscription(config, { event, notifyData }),
      subscriptionType: "MessageStatus",
    };
  }

  if (event.type === EventTypes.CHANNEL_STATUS_PUBLISHED) {
    const notifyData = event.data as ChannelStatusData;
    return {
      matched: matchesChannelStatusSubscription(config, { event, notifyData }),
      subscriptionType: "ChannelStatus",
    };
  }

  logger.warn("Unknown event type for filtering", { eventType: event.type });
  throw new TransformationError(`Unsupported event type: ${event.type}`);
};
