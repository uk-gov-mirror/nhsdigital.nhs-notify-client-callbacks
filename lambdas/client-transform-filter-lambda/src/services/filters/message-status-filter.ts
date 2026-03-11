import type {
  ClientSubscriptionConfiguration,
  MessageStatusData,
  MessageStatusSubscriptionConfiguration,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { logger } from "services/logger";

type FilterContext = {
  event: StatusPublishEvent;
  notifyData: MessageStatusData;
};

const isMessageStatusSubscription = (
  subscription: ClientSubscriptionConfiguration[number],
): subscription is MessageStatusSubscriptionConfiguration =>
  subscription.SubscriptionType === "MessageStatus";

export const matchesMessageStatusSubscription = (
  config: ClientSubscriptionConfiguration,
  context: FilterContext,
): boolean => {
  const { notifyData } = context;

  const matched = config
    .filter((sub) => isMessageStatusSubscription(sub))
    .some((subscription) => {
      if (subscription.ClientId !== notifyData.clientId) {
        return false;
      }

      // Check if message status changed AND client is subscribed to it
      const messageStatusChanged =
        notifyData.previousMessageStatus !== notifyData.messageStatus;
      const clientSubscribedStatus = subscription.MessageStatuses.includes(
        notifyData.messageStatus,
      );

      if (!messageStatusChanged || !clientSubscribedStatus) {
        logger.debug(
          "Message status filter rejected: no matching status change for subscription",
          {
            clientId: notifyData.clientId,
            messageStatus: notifyData.messageStatus,
            previousMessageStatus: notifyData.previousMessageStatus,
            messageStatusChanged,
            clientSubscribedStatus,
            expectedStatuses: subscription.MessageStatuses,
          },
        );
        return false;
      }

      return true;
    });

  if (matched) {
    logger.debug("Message status filter matched", {
      clientId: notifyData.clientId,
      messageStatus: notifyData.messageStatus,
    });
  }

  return matched;
};
