/**
 * Transform & Filter Lambda Handler
 *
 * Receives events from SQS via EventBridge Pipe, validates, transforms,
 * and returns filtered events for delivery to client webhooks.
 *
 */

import type { StatusTransitionEvent } from "models/status-transition-event";
import { EventTypes } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";
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
 * Parse incoming event payload from EventBridge Pipes with SQS source
 * EventBridge Pipes always sends an array of SQS message records
 */
function parseEventPayload(event: any[]): any[] {
  return event.map((sqsMessage) => {
    // Extract CloudEvent from SQS message body
    return JSON.parse(sqsMessage.body);
  });
}

/**
 * Transform event based on its type
 */
function transformEvent(
  rawEvent: any,
  eventType: string,
  correlationId: string | undefined,
): any {
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

/**
 * Process a single event: validate, transform, emit metrics
 */
async function processSingleEvent(rawEvent: any): Promise<any> {
  const correlationId = extractCorrelationId(rawEvent);
  logger.addContext({ correlationId });

  logLifecycleEvent("received", {
    correlationId,
    eventType: rawEvent.type,
  });

  // Validate event schema
  validateStatusTransitionEvent(rawEvent);

  const eventType = rawEvent.type;
  if (!eventType) {
    throw new ValidationError(
      "Event type is required",
      correlationId,
      rawEvent.id,
    );
  }

  const clientId = rawEvent.data?.clientId;

  // Emit metric for event received
  await metricsService.emitEventReceived(
    eventType ?? "unknown",
    clientId ?? "unknown",
  );

  logLifecycleEvent("transformation-started", {
    correlationId,
    eventType,
    clientId,
  });

  // Transform based on event type
  const callbackPayload = transformEvent(rawEvent, eventType, correlationId);

  logLifecycleEvent("transformation-completed", {
    correlationId,
    eventType,
    clientId,
  });

  // Emit metric for successful transformation
  await metricsService.emitTransformationSuccess(
    eventType,
    clientId || "unknown",
  );

  // For US1, we pass all transformed events through
  // US2 will add subscription filtering logic here
  const transformedEvent = {
    ...rawEvent,
    transformedPayload: callbackPayload,
  };

  logLifecycleEvent("delivery-initiated", {
    correlationId,
    eventType,
    clientId,
  });

  // Emit metric for callback delivery initiated
  await metricsService.emitDeliveryInitiated(clientId || "unknown");

  // Clear context for next event
  logger.clearContext();

  return transformedEvent;
}

/**
 * Handle errors from event processing
 */
async function handleEventError(
  error: unknown,
  correlationId: string,
  eventType: string,
  rawEvent: any,
): Promise<never> {
  const eventCorrelationId = correlationId || "unknown";
  const eventErrorType = eventType || "unknown";

  if (error instanceof ValidationError) {
    logger.error("Event validation failed", {
      correlationId: eventCorrelationId,
      error,
    });
    await metricsService.emitValidationError(eventErrorType);
    throw error;
  }

  if (error instanceof TransformationError) {
    logger.error("Event transformation failed", {
      correlationId: eventCorrelationId,
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
  const wrappedError = wrapUnknownError(
    error,
    eventCorrelationId,
    rawEvent?.id,
  );
  logger.error("Unexpected error processing event", {
    correlationId: eventCorrelationId,
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
export const handler = async (event: any): Promise<any> => {
  const startTime = Date.now();
  let correlationId: string | undefined;
  let eventType: string | undefined;

  try {
    const parsedEvents = parseEventPayload(event);
    const transformedEvents: any[] = [];

    // Process each event in the batch
    for (const rawEvent of parsedEvents) {
      try {
        correlationId = extractCorrelationId(rawEvent);
        eventType = rawEvent.type;
        const transformedEvent = await processSingleEvent(rawEvent);
        transformedEvents.push(transformedEvent);
      } catch (error) {
        await handleEventError(
          error,
          correlationId || "unknown",
          eventType || "unknown",
          rawEvent,
        );
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
