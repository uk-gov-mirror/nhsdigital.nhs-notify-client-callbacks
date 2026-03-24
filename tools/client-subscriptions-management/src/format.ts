import { table } from "table";
import type {
  CallbackTarget,
  ClientSubscriptionConfiguration,
  SubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";

const SUBSCRIPTION_TABLE_HEADER = [
  "Subscription ID",
  "Type",
  "Statuses",
  "Target IDs",
];

const TARGET_TABLE_HEADER = [
  "Target ID",
  "Endpoint",
  "Method",
  "Rate Limit",
  "API Key Header",
];

const subscriptionStatuses = (
  subscription: SubscriptionConfiguration,
): string => {
  if (subscription.subscriptionType === "MessageStatus") {
    return subscription.messageStatuses.join(", ");
  }
  const statuses = [
    ...subscription.channelStatuses,
    ...subscription.supplierStatuses,
  ];
  return `${subscription.channelType}: ${statuses.join(", ")}`;
};

export const formatSubscriptionsTable = (
  subscriptions: SubscriptionConfiguration[],
): string =>
  table([
    SUBSCRIPTION_TABLE_HEADER,
    ...subscriptions.map((sub) => [
      sub.subscriptionId,
      sub.subscriptionType,
      subscriptionStatuses(sub),
      sub.targetIds.join(", "),
    ]),
  ]);

export const formatTargetsTable = (targets: CallbackTarget[]): string =>
  table([
    TARGET_TABLE_HEADER,
    ...targets.map((t) => [
      t.targetId,
      t.invocationEndpoint,
      t.invocationMethod,
      String(t.invocationRateLimit),
      t.apiKey.headerName,
    ]),
  ]);

export const formatClientConfig = (
  config: ClientSubscriptionConfiguration,
): string => {
  const subscriptionsTable =
    config.subscriptions.length > 0
      ? `Subscriptions:\n${formatSubscriptionsTable(config.subscriptions)}`
      : "Subscriptions: (none)";
  const targetsTable =
    config.targets.length > 0
      ? `Targets:\n${formatTargetsTable(config.targets)}`
      : "Targets: (none)";
  return `Client: ${config.clientId}\n\n${subscriptionsTable}\n${targetsTable}`;
};

export const normalizeClientName = (name: string): string =>
  name.replaceAll(/\s+/g, "-").toLowerCase();
