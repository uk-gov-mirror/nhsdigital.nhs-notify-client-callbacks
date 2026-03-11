import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import { table } from "table";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";

const SUBSCRIPTION_TABLE_HEADER = [
  "Client ID",
  "Subscription Type",
  "Statuses",
  "Target ID",
  "Endpoint",
  "Method",
  "Rate Limit",
  "API Key Header",
  "API Key Value",
];

const subscriptionStatuses = (
  subscription: ClientSubscriptionConfiguration[number],
): string => {
  if (subscription.SubscriptionType === "MessageStatus") {
    return subscription.MessageStatuses.join(", ");
  }
  const statuses = [
    ...subscription.ChannelStatuses,
    ...subscription.SupplierStatuses,
  ];
  return `${subscription.ChannelType}: ${statuses.join(", ")}`;
};

export const formatSubscriptionFileResponse = (
  subscriptions: ClientSubscriptionConfiguration,
): string => {
  const rows = subscriptions.flatMap((subscription) =>
    subscription.Targets.map((target) => [
      subscription.ClientId,
      subscription.SubscriptionType,
      subscriptionStatuses(subscription),
      target.TargetId,
      target.InvocationEndpoint,
      target.InvocationMethod,
      String(target.InvocationRateLimit),
      target.APIKey.HeaderName,
      target.APIKey.HeaderValue,
    ]),
  );
  return table([SUBSCRIPTION_TABLE_HEADER, ...rows]);
};

export const normalizeClientName = (name: string): string =>
  name.replaceAll(/\s+/g, "-").toLowerCase();

export const resolveProfile = (
  profileArg?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => profileArg ?? env.AWS_PROFILE;

export const resolveAccountId = async (
  profile?: string,
  region?: string,
): Promise<string> => {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const client = new STSClient({ region, credentials });
  const { Account } = await client.send(new GetCallerIdentityCommand({}));
  if (!Account) {
    throw new Error("Unable to determine AWS account ID from STS");
  }
  return Account;
};

export const deriveBucketName = (
  accountId: string,
  environment: string,
  region: string,
  project = "nhs",
  component = "callbacks",
): string =>
  `${project}-${accountId}-${region}-${environment}-${component}-subscription-config`;

export const resolveBucketName = async (
  bucketArg?: string,
  environment?: string,
  region?: string,
  profile?: string,
  project?: string,
): Promise<string> => {
  if (bucketArg) {
    return bucketArg;
  }
  if (!environment) {
    throw new Error(
      "Bucket name is required: use --bucket-name to specify directly, or --environment (with --region and optionally --profile) to determine this automatically",
    );
  }
  const resolvedRegion = region ?? "eu-west-2";
  const accountId = await resolveAccountId(profile, resolvedRegion);
  return deriveBucketName(accountId, environment, resolvedRegion, project);
};

export const resolveRegion = (
  regionArg?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => regionArg ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION;
