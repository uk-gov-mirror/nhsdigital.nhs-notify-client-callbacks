import type {
  ChannelStatusData,
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { logger } from "services/logger";

const isChannelStatusSubscription = (
  subscription: ClientSubscriptionConfiguration["subscriptions"][number],
): subscription is ChannelStatusSubscriptionConfiguration =>
  subscription.subscriptionType === "ChannelStatus";

export const matchesChannelStatusSubscription = (
  config: ClientSubscriptionConfiguration,
  event: StatusPublishEvent<ChannelStatusData>,
): boolean => {
  const { data } = event;

  if (config.clientId !== data.clientId) {
    return false;
  }

  const matched = config.subscriptions
    .filter((subscription) => isChannelStatusSubscription(subscription))
    .some((subscription) => {
      if (subscription.channelType !== data.channel) {
        logger.debug("Channel status filter rejected: channel type mismatch", {
          clientId: data.clientId,
          channel: data.channel,
          expectedChannel: subscription.channelType,
        });
        return false;
      }

      // Check if supplier status changed AND client is subscribed to it
      const supplierStatusChanged =
        data.previousSupplierStatus !== data.supplierStatus;
      const clientSubscribedSupplierStatus = (
        subscription.supplierStatuses as readonly string[]
      ).includes(data.supplierStatus);

      // Check if channel status changed AND client is subscribed to it
      const channelStatusChanged =
        data.previousChannelStatus !== data.channelStatus;
      const clientSubscribedChannelStatus = (
        subscription.channelStatuses as readonly string[]
      ).includes(data.channelStatus);

      const statusMatch =
        (supplierStatusChanged && clientSubscribedSupplierStatus) ||
        (channelStatusChanged && clientSubscribedChannelStatus);

      if (!statusMatch) {
        logger.debug(
          "Channel status filter rejected: no matching status change for subscription",
          {
            clientId: data.clientId,
            channelStatus: data.channelStatus,
            previousChannelStatus: data.previousChannelStatus,
            channelStatusChanged,
            clientSubscribedChannelStatus,
            supplierStatus: data.supplierStatus,
            previousSupplierStatus: data.previousSupplierStatus,
            supplierStatusChanged,
            clientSubscribedSupplierStatus,
            subscribedChannelStatuses: subscription.channelStatuses,
            subscribedSupplierStatuses: subscription.supplierStatuses,
          },
        );
        return false;
      }

      return true;
    });

  if (matched) {
    logger.debug("Channel status filter matched", {
      clientId: data.clientId,
      channel: data.channel,
      channelStatus: data.channelStatus,
      previousChannelStatus: data.previousChannelStatus,
      supplierStatus: data.supplierStatus,
      previousSupplierStatus: data.previousSupplierStatus,
    });
  }

  return matched;
};
