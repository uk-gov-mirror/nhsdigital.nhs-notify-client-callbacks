import { z } from "zod";

import { CHANNEL_TYPES } from "./channel-types";
import type { ClientSubscriptionConfiguration } from "./client-config";
import {
  CHANNEL_STATUSES,
  MESSAGE_STATUSES,
  SUPPLIER_STATUSES,
} from "./status-types";

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
  targetId: z.string(),
  type: z.literal("API"),
  invocationEndpoint: httpsUrlSchema,
  invocationMethod: z.literal("POST"),
  invocationRateLimit: z.number(),
  apiKey: z.object({
    headerName: z.string(),
    headerValue: z.string(),
  }),
});

const baseSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1),
  targetIds: z.array(z.string()).min(1),
});

const messageStatusSchema = baseSubscriptionSchema.extend({
  subscriptionType: z.literal("MessageStatus"),
  messageStatuses: z.array(z.enum(MESSAGE_STATUSES)),
});

const channelStatusSchema = baseSubscriptionSchema.extend({
  subscriptionType: z.literal("ChannelStatus"),
  channelType: z.enum(CHANNEL_TYPES),
  channelStatuses: z.array(z.enum(CHANNEL_STATUSES)),
  supplierStatuses: z.array(z.enum(SUPPLIER_STATUSES)),
});

const subscriptionSchema = z.discriminatedUnion("subscriptionType", [
  messageStatusSchema,
  channelStatusSchema,
]);

export const clientSubscriptionConfigurationSchema = z
  .object({
    clientId: z.string().min(1),
    subscriptions: z.array(subscriptionSchema),
    targets: z.array(targetSchema),
  })
  .superRefine((config, ctx) => {
    const seenSubscriptionIds = new Set<string>();

    for (const [index, subscription] of config.subscriptions.entries()) {
      if (seenSubscriptionIds.has(subscription.subscriptionId)) {
        ctx.addIssue({
          code: "custom",
          message: "Expected subscriptionId to be unique",
          path: ["subscriptions", index, "subscriptionId"],
        });
      } else {
        seenSubscriptionIds.add(subscription.subscriptionId);
      }
    }

    const validTargetIds = new Set<string>();
    for (const [index, target] of config.targets.entries()) {
      if (validTargetIds.has(target.targetId)) {
        ctx.addIssue({
          code: "custom",
          message: "Expected targetId to be unique",
          path: ["targets", index, "targetId"],
        });
      } else {
        validTargetIds.add(target.targetId);
      }
    }

    for (const [
      subscriptionIndex,
      subscription,
    ] of config.subscriptions.entries()) {
      for (const [targetIndex, targetId] of subscription.targetIds.entries()) {
        if (!validTargetIds.has(targetId)) {
          ctx.addIssue({
            code: "custom",
            message: `targetId "${targetId}" not found in targets`,
            path: [
              "subscriptions",
              subscriptionIndex,
              "targetIds",
              targetIndex,
            ],
          });
        }
      }
    }
  });

export const parseClientSubscriptionConfiguration = (
  rawConfig: unknown,
): z.ZodSafeParseResult<ClientSubscriptionConfiguration> =>
  clientSubscriptionConfigurationSchema.safeParse(rawConfig);
