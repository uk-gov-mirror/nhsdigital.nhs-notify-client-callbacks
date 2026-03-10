import { z } from "zod";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import {
  CHANNEL_STATUSES,
  CHANNEL_TYPES,
  MESSAGE_STATUSES,
  SUPPLIER_STATUSES,
} from "@nhs-notify-client-callbacks/models";
import {
  ConfigValidationError,
  type ValidationIssue,
  formatValidationIssuePath,
} from "services/error-handler";

export { ConfigValidationError } from "services/error-handler";

const httpsUrlSchema = z.string().refine(
  (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  },
  {
    message: "Expected HTTPS URL",
  },
);

const targetSchema = z.object({
  Type: z.literal("API"),
  TargetId: z.string(),
  InvocationEndpoint: httpsUrlSchema,
  InvocationMethod: z.literal("POST"),
  InvocationRateLimit: z.number(),
  APIKey: z.object({
    HeaderName: z.string(),
    HeaderValue: z.string(),
  }),
});

const baseSubscriptionSchema = z.object({
  SubscriptionId: z.string().min(1),
  ClientId: z.string(),
  Targets: z.array(targetSchema).min(1),
});

const messageStatusSchema = baseSubscriptionSchema.extend({
  SubscriptionType: z.literal("MessageStatus"),
  MessageStatuses: z.array(z.enum(MESSAGE_STATUSES)),
});

const channelStatusSchema = baseSubscriptionSchema.extend({
  SubscriptionType: z.literal("ChannelStatus"),
  ChannelType: z.enum(CHANNEL_TYPES),
  ChannelStatuses: z.array(z.enum(CHANNEL_STATUSES)),
  SupplierStatuses: z.array(z.enum(SUPPLIER_STATUSES)),
});

const subscriptionSchema = z.discriminatedUnion("SubscriptionType", [
  messageStatusSchema,
  channelStatusSchema,
]);

const configSchema = z.array(subscriptionSchema).superRefine((config, ctx) => {
  const seenSubscriptionIds = new Set<string>();

  for (const [index, subscription] of config.entries()) {
    if (seenSubscriptionIds.has(subscription.SubscriptionId)) {
      ctx.addIssue({
        code: "custom",
        message: "Expected SubscriptionId to be unique",
        path: [index, "SubscriptionId"],
      });
    } else {
      seenSubscriptionIds.add(subscription.SubscriptionId);
    }
  }
});

export const validateClientConfig = (
  rawConfig: unknown,
): ClientSubscriptionConfiguration => {
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => {
      const pathSegments = issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      );

      return {
        path: formatValidationIssuePath(pathSegments),
        message: issue.message,
      };
    });
    throw new ConfigValidationError(issues);
  }

  return result.data;
};

export {
  type ChannelStatusSubscriptionConfiguration,
  type MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
