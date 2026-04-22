import type {
  CallbackTarget,
  Channel,
  ChannelStatus,
  ChannelStatusSubscriptionConfiguration,
  MessageStatus,
  MessageStatusSubscriptionConfiguration,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import pc from "picocolors";

export type BuildTargetArgs = {
  apiEndpoint: string;
  apiKey: string;
  apiKeyHeaderName?: string;
  rateLimit: number;
  maxRetryDurationSeconds?: number;
  mtls?: { enabled: boolean };
  certPinning?: { enabled: boolean; spkiHash?: string };
};

export type BuildMessageStatusSubscriptionArgs = {
  subscriptionId: string;
  targetIds: string[];
  messageStatuses: MessageStatus[];
};

export type BuildChannelStatusSubscriptionArgs = {
  subscriptionId: string;
  targetIds: string[];
  channelType: Channel;
  channelStatuses?: ChannelStatus[];
  supplierStatuses?: SupplierStatus[];
};

export function buildTarget(args: BuildTargetArgs): CallbackTarget {
  const mtls = args.mtls ?? { enabled: false };
  const certPinning = args.certPinning ?? { enabled: false };

  const warnings: string[] = [];

  if (!mtls.enabled) {
    warnings.push("mTLS is disabled — callbacks will not use mutual TLS");
  }

  if (mtls.enabled && !certPinning.enabled) {
    warnings.push("mTLS is enabled but certificate pinning is disabled");
  }

  if (certPinning.enabled && !certPinning.spkiHash) {
    throw new Error(
      "Certificate pinning cannot be enabled without an SPKI hash. Run 'targets-set-certificate' first.",
    );
  }

  if (!mtls.enabled && certPinning.enabled) {
    warnings.push("Certificate pinning is enabled but mTLS is disabled");
  }

  if (
    args.maxRetryDurationSeconds !== undefined &&
    args.maxRetryDurationSeconds < 60
  ) {
    warnings.push(
      `maxRetryDurationSeconds is ${args.maxRetryDurationSeconds}s — values below 60s may exhaust the retry window before a single delivery attempt completes`,
    );
  }

  for (const warning of warnings) {
    console.warn(pc.bold(pc.red(`WARNING: ${warning}`)));
  }

  return {
    targetId: crypto.randomUUID(),
    type: "API",
    invocationEndpoint: args.apiEndpoint,
    invocationMethod: "POST",
    invocationRateLimit: args.rateLimit,
    apiKey: {
      headerName: args.apiKeyHeaderName ?? "x-api-key",
      headerValue: args.apiKey,
    },
    delivery: {
      ...(args.maxRetryDurationSeconds !== undefined && {
        maxRetryDurationSeconds: args.maxRetryDurationSeconds,
      }),
      mtls: {
        ...mtls,
        certPinning,
      },
    },
  };
}

export function buildMessageStatusSubscription(
  args: BuildMessageStatusSubscriptionArgs,
): MessageStatusSubscriptionConfiguration {
  return {
    subscriptionId: args.subscriptionId,
    subscriptionType: "MessageStatus",
    targetIds: args.targetIds,
    messageStatuses: args.messageStatuses,
  };
}

export function buildChannelStatusSubscription(
  args: BuildChannelStatusSubscriptionArgs,
): ChannelStatusSubscriptionConfiguration {
  return {
    subscriptionId: args.subscriptionId,
    subscriptionType: "ChannelStatus",
    targetIds: args.targetIds,
    channelType: args.channelType,
    channelStatuses: args.channelStatuses ?? [],
    supplierStatuses: args.supplierStatuses ?? [],
  };
}
