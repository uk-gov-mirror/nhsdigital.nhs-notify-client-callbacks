import type { SQSRecord } from "aws-lambda";
import type { StatusTransitionEvent } from "models/status-transition-event";
import { EventTypes } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";
import type {
  ChannelStatusAttributes,
  ClientCallbackPayload,
  MessageStatusAttributes,
} from "models/client-callback-payload";
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

interface TransformedEvent extends StatusTransitionEvent {
  transformedPayload: ClientCallbackPayload;
}

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

function logCallbackGenerated(
  payload: ClientCallbackPayload,
  eventType: string,
  correlationId: string | undefined,
  clientId: string,
): void {
  const { attributes } = payload.data[0];

  const commonFields = {
    correlationId,
    callbackType: payload.data[0].type,
    clientId,
    messageId: attributes.messageId,
    messageReference: attributes.messageReference,
  };

  if (eventType === EventTypes.MESSAGE_STATUS_TRANSITIONED) {
    const messageAttrs = attributes as MessageStatusAttributes;
    logger.info("Callback generated", {
      ...commonFields,
      messageStatus: messageAttrs.messageStatus,
      messageStatusDescription: messageAttrs.messageStatusDescription,
      messageFailureReasonCode: messageAttrs.messageFailureReasonCode,
      channels: messageAttrs.channels,
    });
  } else if (eventType === EventTypes.CHANNEL_STATUS_TRANSITIONED) {
    const channelAttrs = attributes as ChannelStatusAttributes;
    logger.info("Callback generated", {
      ...commonFields,
      channel: channelAttrs.channel,
      channelStatus: channelAttrs.channelStatus,
      channelStatusDescription: channelAttrs.channelStatusDescription,
      channelFailureReasonCode: channelAttrs.channelFailureReasonCode,
      supplierStatus: channelAttrs.supplierStatus,
    });
  }
}

async function processSingleEvent(
  sqsRecord: SQSRecord,
): Promise<TransformedEvent> {
  const event = parseSqsMessageBody(sqsRecord);

  const correlationId = extractCorrelationId(event);
  logger.addContext({ correlationId });

  validateStatusTransitionEvent(event);

  const eventType = event.type;
  const { clientId, messageId } = event.data;

  logLifecycleEvent("received", {
    correlationId,
    eventType,
    messageId,
  });

  await metricsService.emitEventReceived(eventType, clientId);

  logLifecycleEvent("transformation-started", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  const callbackPayload = transformEvent(event, eventType, correlationId);

  logCallbackGenerated(callbackPayload, eventType, correlationId, clientId);

  logLifecycleEvent("transformation-completed", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  await metricsService.emitTransformationSuccess(eventType, clientId);

  const transformedEvent: TransformedEvent = {
    ...event,
    transformedPayload: callbackPayload,
  };

  logLifecycleEvent("delivery-initiated", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  await metricsService.emitDeliveryInitiated(clientId);

  logger.clearContext();

  return transformedEvent;
}

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

export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const startTime = Date.now();
  let correlationId: string | undefined;
  let eventType: string | undefined;

  const stats = {
    successful: 0,
    failed: 0,
    processed: 0,
  };

  try {
    const transformedEvents: TransformedEvent[] = [];

    for (const sqsRecord of event) {
      try {
        const transformedEvent = await processSingleEvent(sqsRecord);
        transformedEvents.push(transformedEvent);
        eventType = transformedEvent.type;
        stats.successful += 1;
      } catch (error) {
        stats.failed += 1;
        if (
          error instanceof ValidationError ||
          error instanceof TransformationError
        ) {
          correlationId = error.correlationId;
          // Event type may not be available if parsing/validation failed early
        }
        await handleEventError(error, correlationId, eventType);
      } finally {
        stats.processed += 1;
      }
    }

    logger.info("Batch processing completed", stats);

    const processingTime = Date.now() - startTime;
    if (eventType) {
      await metricsService.emitProcessingLatency(processingTime, eventType);
    }

    return transformedEvents;
  } catch (error) {
    logger.error("Lambda execution failed", {
      correlationId,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Rethrow to trigger Lambda retry or DLQ routing
    throw error;
  }
};
