/**
 * Transform & Filter Lambda Handler
 *
 * Receives events from SQS via EventBridge Pipe, validates, transforms,
 * and returns filtered events for delivery to client webhooks.
 *
 */

import type { SQSRecord } from "aws-lambda";
import type { StatusTransitionEvent } from "models/status-transition-event";
import { EventTypes } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";
import type { ClientCallbackPayload } from "models/client-callback-payload";
import { validateStatusTransitionEvent } from "services/validators/event-validator";
import { transformMessageStatus } from "services/transformers/message-status-transformer";
import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import {
  extractCorrelationId,
  logLifecycleEvent,
  logger,
} from "services/logger";
import {
  TransformationError,
  ValidationError,
  wrapUnknownError,
} from "services/error-handler";
import { metricsService } from "services/metrics";

/**
 * Transformed event returned by the enrichment lambda.
 * Contains the original event plus the transformed callback payload.
 */
interface TransformedEvent extends StatusTransitionEvent {
  transformedPayload: ClientCallbackPayload;
}

/**
 * Transform event based on its type
 */
function transformEvent(
  rawEvent: StatusTransitionEvent,
  eventType: string,
  correlationId: string | undefined,
): ClientCallbackPayload {
  if (eventType === EventTypes.MESSAGE_STATUS_TRANSITIONED) {
    const typedEvent = rawEvent as StatusTransitionEvent<MessageStatusData>;
    return transformMessageStatus(typedEvent);
  }
  if (eventType === EventTypes.CHANNEL_STATUS_TRANSITIONED) {
    const typedEvent = rawEvent as StatusTransitionEvent<ChannelStatusData>;
    return transformChannelStatus(typedEvent);
  }
  throw new TransformationError(
    `Unsupported event type: ${eventType}`,
    correlationId,
    rawEvent.id,
  );
}

function parseSqsMessageBody(sqsRecord: SQSRecord): unknown {
  try {
    return JSON.parse(sqsRecord.body);
  } catch (error) {
    throw new ValidationError(
      `Failed to parse SQS message body as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      undefined,
      sqsRecord.messageId,
    );
  }
}

async function processSingleEvent(
  sqsRecord: SQSRecord,
): Promise<TransformedEvent> {
  const rawEvent = parseSqsMessageBody(sqsRecord);

  const correlationId = extractCorrelationId(rawEvent);
  logger.addContext({ correlationId });

  logLifecycleEvent("received", {
    correlationId,
    eventType: (rawEvent as StatusTransitionEvent).type,
  });

  validateStatusTransitionEvent(rawEvent);

  const validatedEvent = rawEvent as StatusTransitionEvent;

  const eventType = validatedEvent.type;
  const { clientId } = validatedEvent.data;

  await metricsService.emitEventReceived(eventType, clientId);

  logLifecycleEvent("transformation-started", {
    correlationId,
    eventType,
    clientId,
  });

  const callbackPayload = transformEvent(
    validatedEvent,
    eventType,
    correlationId,
  );

  logLifecycleEvent("transformation-completed", {
    correlationId,
    eventType,
    clientId,
  });

  await metricsService.emitTransformationSuccess(eventType, clientId);

  const transformedEvent: TransformedEvent = {
    ...validatedEvent,
    transformedPayload: callbackPayload,
  };

  logLifecycleEvent("delivery-initiated", {
    correlationId,
    eventType,
    clientId,
  });

  await metricsService.emitDeliveryInitiated(clientId);

  logger.clearContext();

  return transformedEvent;
}

/**
 * Handle errors from event processing
 */
async function handleEventError(
  error: unknown,
  correlationId = "unknown",
  eventErrorType = "unknown",
): Promise<never> {
  if (error instanceof ValidationError) {
    logger.error("Event validation failed", {
      correlationId,
      error,
    });
    await metricsService.emitValidationError(eventErrorType);
    throw error;
  }

  if (error instanceof TransformationError) {
    logger.error("Event transformation failed", {
      correlationId,
      eventType: eventErrorType,
      error,
    });
    await metricsService.emitTransformationFailure(
      eventErrorType,
      "TransformationError",
    );
    throw error;
  }

  // Unknown errors
  const wrappedError = wrapUnknownError(error, correlationId);
  logger.error("Unexpected error processing event", {
    correlationId,
    error: wrappedError,
  });
  await metricsService.emitTransformationFailure(
    eventErrorType,
    "UnknownError",
  );
  throw wrappedError;
}

/**
 * Lambda handler entry point
 *
 * Processes events from EventBridge Pipe (SQS source).
 * Returns transformed events for routing to Callbacks Event Bus.
 */
export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const startTime = Date.now();
  let correlationId: string | undefined;
  let eventType: string | undefined;

  try {
    const transformedEvents: TransformedEvent[] = [];

    for (const sqsRecord of event) {
      try {
        const transformedEvent = await processSingleEvent(sqsRecord);
        transformedEvents.push(transformedEvent);
        eventType = transformedEvent.type;
      } catch (error) {
        // Extract correlation ID and event type from error if available
        if (
          error instanceof ValidationError ||
          error instanceof TransformationError
        ) {
          correlationId = error.correlationId;
          // Event type may not be available if parsing/validation failed early
        }
        await handleEventError(error, correlationId, eventType);
      }
    }

    // Emit processing latency metric
    const processingTime = Date.now() - startTime;
    if (eventType) {
      await metricsService.emitProcessingLatency(processingTime, eventType);
    }

    // Return transformed events for EventBridge Pipe to route to Callbacks Event Bus
    return transformedEvents;
  } catch (error) {
    // Top-level error handler
    logger.error("Lambda execution failed", {
      correlationId,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Rethrow to trigger Lambda retry or DLQ routing
    throw error;
  }
};
