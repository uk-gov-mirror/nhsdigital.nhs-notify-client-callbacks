import type {
  ClientSubscriptionConfiguration,
  MessageStatusData,
  MessageStatusSubscriptionConfiguration,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { logger } from "services/logger";

const isMessageStatusSubscription = (
  subscription: ClientSubscriptionConfiguration["subscriptions"][number],
): subscription is MessageStatusSubscriptionConfiguration =>
  subscription.subscriptionType === "MessageStatus";

export const matchesMessageStatusSubscription = (
  config: ClientSubscriptionConfiguration,
  event: StatusPublishEvent<MessageStatusData>,
): boolean => {
  const { data } = event;

  if (config.clientId !== data.clientId) {
    return false;
  }

  const matched = config.subscriptions
    .filter((subscription) => isMessageStatusSubscription(subscription))
    .some((subscription) => {
      const messageStatusChanged =
        data.previousMessageStatus !== data.messageStatus;
      const clientSubscribedStatus = (
        subscription.messageStatuses as readonly string[]
      ).includes(data.messageStatus);

      if (!messageStatusChanged || !clientSubscribedStatus) {
        logger.debug(
          "Message status filter rejected: no matching status change for subscription",
          {
            clientId: data.clientId,
            messageStatus: data.messageStatus,
            previousMessageStatus: data.previousMessageStatus,
            messageStatusChanged,
            clientSubscribedStatus,
            expectedStatuses: subscription.messageStatuses,
          },
        );
        return false;
      }

      return true;
    });

  if (matched) {
    logger.debug("Message status filter matched", {
      clientId: data.clientId,
      messageStatus: data.messageStatus,
    });
  }

  return matched;
};
