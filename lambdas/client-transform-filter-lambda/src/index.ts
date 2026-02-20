import type { SQSRecord } from "aws-lambda";
import pMap from "p-map";
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
  Logger,
  extractCorrelationId,
  logLifecycleEvent,
} from "services/logger";
import {
  TransformationError,
  ValidationError,
  wrapUnknownError,
} from "services/error-handler";
import { CallbackMetrics, createMetricLogger } from "services/metrics";

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
  eventLogger: Logger,
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
    eventLogger.info("Callback generated", {
      ...commonFields,
      messageStatus: messageAttrs.messageStatus,
      messageStatusDescription: messageAttrs.messageStatusDescription,
      messageFailureReasonCode: messageAttrs.messageFailureReasonCode,
      channels: messageAttrs.channels,
    });
  } else if (eventType === EventTypes.CHANNEL_STATUS_TRANSITIONED) {
    const channelAttrs = attributes as ChannelStatusAttributes;
    eventLogger.info("Callback generated", {
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
  metrics: CallbackMetrics,
  eventLogger: Logger,
): Promise<TransformedEvent> {
  const event = parseSqsMessageBody(sqsRecord);

  const correlationId = extractCorrelationId(event);

  validateStatusTransitionEvent(event);

  const eventType = event.type;
  const { clientId, messageId } = event.data;

  logLifecycleEvent(eventLogger, "received", {
    correlationId,
    eventType,
    messageId,
  });

  metrics.emitEventReceived(eventType, clientId);

  logLifecycleEvent(eventLogger, "transformation-started", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  const callbackPayload = transformEvent(event, eventType, correlationId);

  logCallbackGenerated(
    eventLogger,
    callbackPayload,
    eventType,
    correlationId,
    clientId,
  );

  logLifecycleEvent(eventLogger, "transformation-completed", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  metrics.emitTransformationSuccess(eventType, clientId);

  const transformedEvent: TransformedEvent = {
    ...event,
    transformedPayload: callbackPayload,
  };

  logLifecycleEvent(eventLogger, "delivery-initiated", {
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  metrics.emitDeliveryInitiated(clientId);

  return transformedEvent;
}

async function handleEventError(
  error: unknown,
  metrics: CallbackMetrics,
  eventLogger: Logger,
  correlationId = "unknown",
  eventErrorType = "unknown",
): Promise<never> {
  if (error instanceof ValidationError) {
    eventLogger.error("Event validation failed", {
      correlationId,
      error,
    });
    metrics.emitValidationError(eventErrorType);
    throw error;
  }

  if (error instanceof TransformationError) {
    eventLogger.error("Event transformation failed", {
      correlationId,
      eventType: eventErrorType,
      error,
    });
    metrics.emitTransformationFailure(eventErrorType, "TransformationError");
    throw error;
  }

  const wrappedError = wrapUnknownError(error, correlationId);
  eventLogger.error("Unexpected error processing event", {
    correlationId,
    error: wrappedError,
  });
  metrics.emitTransformationFailure(eventErrorType, "UnknownError");
  throw wrappedError;
}

export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const rootLogger = new Logger();

  const startTime = Date.now();
  let correlationId: string | undefined;
  let eventType: string | undefined;

  const stats = {
    successful: 0,
    failed: 0,
    processed: 0,
  };

  try {
    const transformedEvents = await pMap(
      event,
      async (sqsRecord: SQSRecord) => {
        const eventLogger = rootLogger.child({
          messageId: sqsRecord.messageId,
        });

        try {
          const transformedEvent = await processSingleEvent(
            sqsRecord,
            metrics,
            eventLogger,
          );
          eventType = transformedEvent.type;
          stats.successful += 1;
          return transformedEvent;
        } catch (error) {
          stats.failed += 1;
          if (
            error instanceof ValidationError ||
            error instanceof TransformationError
          ) {
            correlationId = error.correlationId;
          }
          await handleEventError(
            error,
            metrics,
            eventLogger,
            correlationId,
            eventType,
          );
          return null;
        } finally {
          stats.processed += 1;
        }
      },
      { concurrency: 10 },
    );

    rootLogger.info("Batch processing completed", stats);

    const processingTime = Date.now() - startTime;
    if (eventType) {
      metrics.emitProcessingLatency(processingTime, eventType);
    }

    await metricsLogger.flush();
    return transformedEvents.filter((e): e is TransformedEvent => e !== null);
  } catch (error) {
    rootLogger.error("Lambda execution failed", {
      correlationId,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    await metricsLogger.flush();
    // Rethrow to trigger Lambda retry or DLQ routing
    throw error;
  }
};
