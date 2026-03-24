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
  targetIds?: string[];
};

const unique = (values: string[]): string[] => [...new Set(values)];

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
    const typedEvent = event as StatusPublishEvent<MessageStatusData>;
    const matchingTargetIds = unique(
      config.subscriptions
        .filter((subscription) =>
          matchesMessageStatusSubscription(
            {
              ...config,
              subscriptions: [subscription],
            },
            typedEvent,
          ),
        )
        .flatMap((subscription) => subscription.targetIds),
    );

    return {
      matched: matchingTargetIds.length > 0,
      subscriptionType: "MessageStatus",
      ...(matchingTargetIds.length > 0 ? { targetIds: matchingTargetIds } : {}),
    };
  }

  if (event.type === EventTypes.CHANNEL_STATUS_PUBLISHED) {
    const typedEvent = event as StatusPublishEvent<ChannelStatusData>;
    const matchingTargetIds = unique(
      config.subscriptions
        .filter((subscription) =>
          matchesChannelStatusSubscription(
            {
              ...config,
              subscriptions: [subscription],
            },
            typedEvent,
          ),
        )
        .flatMap((subscription) => subscription.targetIds),
    );

    return {
      matched: matchingTargetIds.length > 0,
      subscriptionType: "ChannelStatus",
      ...(matchingTargetIds.length > 0 ? { targetIds: matchingTargetIds } : {}),
    };
  }

  logger.warn("Unknown event type for filtering", { eventType: event.type });
  throw new TransformationError(`Unsupported event type: ${event.type}`);
};
