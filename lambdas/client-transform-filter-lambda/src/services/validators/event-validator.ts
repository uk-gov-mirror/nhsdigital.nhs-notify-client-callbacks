import {
  CloudEvent,
  ValidationError as CloudEventsValidationError,
} from "cloudevents";
import { z } from "zod";
import {
  EventTypes,
  type StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import {
  ValidationError,
  formatValidationIssuePath,
} from "services/error-handler";
import { extractCorrelationId } from "@nhs-notify-client-callbacks/logger";

const NHSNotifyExtensionsSchema = z.object({
  traceparent: z.string().min(1),
});

const EventConstraintsSchema = z.object({
  type: z.enum([
    EventTypes.MESSAGE_STATUS_PUBLISHED,
    EventTypes.CHANNEL_STATUS_PUBLISHED,
  ]),
  datacontenttype: z.literal("application/json"),
  data: z.unknown(),
});

const BaseDataSchema = z.object({
  clientId: z.string().min(1),
  messageId: z.string().min(1),
  timestamp: z
    .string()
    .min(1)
    .pipe(z.iso.datetime("data.timestamp must be a valid RFC 3339 timestamp")),
});

const MessageStatusDataSchema = BaseDataSchema.extend({
  messageStatus: z.string().min(1),
  channels: z
    .array(
      z.object({
        type: z.string().min(1),
        channelStatus: z.string().min(1),
      }),
    )
    .min(1, "data.channels must have at least one channel"),
});

const ChannelStatusDataSchema = BaseDataSchema.extend({
  channel: z.string().min(1),
  channelStatus: z.string().min(1),
  supplierStatus: z.string().min(1),
});

function isMessageStatusEvent(type: string): boolean {
  return type === EventTypes.MESSAGE_STATUS_PUBLISHED;
}

function isChannelStatusEvent(type: string): boolean {
  return type === EventTypes.CHANNEL_STATUS_PUBLISHED;
}

function formatValidationError(error: unknown, event: unknown): never {
  const correlationId = extractCorrelationId(event);

  let message: string;
  if (error instanceof CloudEventsValidationError) {
    message = `CloudEvents validation failed: ${error.message}`;
  } else if (error instanceof z.ZodError) {
    const issues = error.issues
      .map((issue) => {
        const path = formatValidationIssuePath(
          issue.path.filter(
            (segment): segment is string | number =>
              typeof segment === "string" || typeof segment === "number",
          ),
        );
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(", ");
    message = `Validation failed: ${issues}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = `Validation failed: ${JSON.stringify(error)}`;
  }

  throw new ValidationError(message, correlationId);
}

export function validateStatusPublishEvent(
  event: unknown,
): asserts event is StatusPublishEvent {
  try {
    const ce = new CloudEvent(event as any, true);

    NHSNotifyExtensionsSchema.parse(event);
    EventConstraintsSchema.parse(event);

    if (isMessageStatusEvent(ce.type)) {
      MessageStatusDataSchema.parse(ce.data);
    } else if (isChannelStatusEvent(ce.type)) {
      ChannelStatusDataSchema.parse(ce.data);
    }
  } catch (error) {
    formatValidationError(error, event);
  }
}
