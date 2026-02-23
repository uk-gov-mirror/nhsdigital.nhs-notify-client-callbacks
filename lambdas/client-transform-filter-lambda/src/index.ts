import type { SQSRecord } from "aws-lambda";
import pMap from "p-map";
import type { StatusTransitionEvent } from "models/status-transition-event";
import { EventTypes } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";
import type { ClientCallbackPayload } from "models/client-callback-payload";
import { validateStatusTransitionEvent } from "services/validators/event-validator";
import { transformMessageStatus } from "services/transformers/message-status-transformer";
import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import {
  Logger,
  extractCorrelationId,
  logLifecycleEvent,
} from "services/logger";
import { logCallbackGenerated } from "services/callback-logger";
import {
  TransformationError,
  ValidationError,
  getEventError,
} from "services/error-handler";
import { CallbackMetrics, createMetricLogger } from "services/metrics";

const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY) || 10;

interface TransformedEvent extends StatusTransitionEvent {
  transformedPayload: ClientCallbackPayload;
}

class BatchStats {
  successful = 0;

  failed = 0;

  processed = 0;

  recordSuccess(): void {
    this.successful += 1;
    this.processed += 1;
  }

  recordFailure(): void {
    this.failed += 1;
    this.processed += 1;
  }

  toObject() {
    return {
      successful: this.successful,
      failed: this.failed,
      processed: this.processed,
    };
  }
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
  );
}

function parseSqsMessageBody(sqsRecord: SQSRecord): StatusTransitionEvent {
  try {
    const parsed = JSON.parse(sqsRecord.body);
    validateStatusTransitionEvent(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      `Failed to parse SQS message body as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      undefined,
    );
  }
}

function processSingleEvent(
  event: StatusTransitionEvent,
  metrics: CallbackMetrics,
  eventLogger: Logger,
): TransformedEvent {
  const correlationId = extractCorrelationId(event);

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

  return {
    ...event,
    transformedPayload: callbackPayload,
  };
}

function logDeliveryInitiated(
  transformedEvents: TransformedEvent[],
  metrics: CallbackMetrics,
  logger: Logger,
): void {
  for (const transformedEvent of transformedEvents) {
    const { clientId, messageId } = transformedEvent.data;
    const correlationId = transformedEvent.traceparent;

    logLifecycleEvent(logger, "delivery-initiated", {
      correlationId,
      eventType: transformedEvent.type,
      clientId,
      messageId,
    });

    metrics.emitDeliveryInitiated(clientId);
  }
}

async function transformBatch(
  sqsRecords: SQSRecord[],
  metrics: CallbackMetrics,
  rootLogger: Logger,
  stats: BatchStats,
): Promise<TransformedEvent[]> {
  return pMap(
    sqsRecords,
    (sqsRecord: SQSRecord) => {
      const event = parseSqsMessageBody(sqsRecord);
      const correlationId = extractCorrelationId(event);

      const eventLogger = rootLogger.child({
        correlationId,
        eventType: event.type,
        clientId: event.data.clientId,
        messageId: event.data.messageId,
      });

      const transformedEvent = processSingleEvent(event, metrics, eventLogger);
      stats.recordSuccess();
      return transformedEvent;
    },
    { concurrency: BATCH_CONCURRENCY, stopOnError: true },
  );
}

export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const rootLogger = new Logger();

  const startTime = Date.now();
  const stats = new BatchStats();

  try {
    const transformedEvents = await transformBatch(
      event,
      metrics,
      rootLogger,
      stats,
    );

    const processingTime = Date.now() - startTime;
    logLifecycleEvent(rootLogger, "batch-processing-completed", {
      ...stats.toObject(),
      batchSize: event.length,
      processingTimeMs: processingTime,
    });

    // Emit delivery-initiated metrics only after entire batch succeeds
    logDeliveryInitiated(transformedEvents, metrics, rootLogger);

    await metricsLogger.flush();
    return transformedEvents;
  } catch (error) {
    stats.recordFailure();

    const wrappedError = getEventError(error, metrics, rootLogger);

    await metricsLogger.flush();
    throw wrappedError;
  }
};
