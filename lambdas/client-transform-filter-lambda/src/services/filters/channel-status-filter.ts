import type {
  ChannelStatusData,
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { logger } from "services/logger";

type FilterContext = {
  event: StatusPublishEvent;
  notifyData: ChannelStatusData;
};

const isChannelStatusSubscription = (
  subscription: ClientSubscriptionConfiguration[number],
): subscription is ChannelStatusSubscriptionConfiguration =>
  subscription.SubscriptionType === "ChannelStatus";

export const matchesChannelStatusSubscription = (
  config: ClientSubscriptionConfiguration,
  context: FilterContext,
): boolean => {
  const { notifyData } = context;

  const matched = config
    .filter((sub) => isChannelStatusSubscription(sub))
    .some((subscription) => {
      if (subscription.ClientId !== notifyData.clientId) {
        return false;
      }

      if (subscription.ChannelType !== notifyData.channel) {
        logger.debug("Channel status filter rejected: channel type mismatch", {
          clientId: notifyData.clientId,
          channel: notifyData.channel,
          expectedChannel: subscription.ChannelType,
        });
        return false;
      }

      // Check if supplier status changed AND client is subscribed to it
      const supplierStatusChanged =
        notifyData.previousSupplierStatus !== notifyData.supplierStatus;
      const clientSubscribedSupplierStatus =
        subscription.SupplierStatuses.includes(notifyData.supplierStatus);

      // Check if channel status changed AND client is subscribed to it
      const channelStatusChanged =
        notifyData.previousChannelStatus !== notifyData.channelStatus;
      const clientSubscribedChannelStatus =
        subscription.ChannelStatuses.includes(notifyData.channelStatus);

      const statusMatch =
        (supplierStatusChanged && clientSubscribedSupplierStatus) ||
        (channelStatusChanged && clientSubscribedChannelStatus);

      if (!statusMatch) {
        logger.debug(
          "Channel status filter rejected: no matching status change for subscription",
          {
            clientId: notifyData.clientId,
            channelStatus: notifyData.channelStatus,
            previousChannelStatus: notifyData.previousChannelStatus,
            channelStatusChanged,
            clientSubscribedChannelStatus,
            supplierStatus: notifyData.supplierStatus,
            previousSupplierStatus: notifyData.previousSupplierStatus,
            supplierStatusChanged,
            clientSubscribedSupplierStatus,
            subscribedChannelStatuses: subscription.ChannelStatuses,
            subscribedSupplierStatuses: subscription.SupplierStatuses,
          },
        );
        return false;
      }

      return true;
    });

  if (matched) {
    logger.debug("Channel status filter matched", {
      clientId: notifyData.clientId,
      channel: notifyData.channel,
      channelStatus: notifyData.channelStatus,
      previousChannelStatus: notifyData.previousChannelStatus,
      supplierStatus: notifyData.supplierStatus,
      previousSupplierStatus: notifyData.previousSupplierStatus,
    });
  }

  return matched;
};
