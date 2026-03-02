import type { SQSRecord } from "aws-lambda";
import pMap from "p-map";
import type {
  ClientCallbackPayload,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { validateStatusTransitionEvent } from "services/validators/event-validator";
import { transformEvent } from "services/transformers/event-transformer";
import { extractCorrelationId } from "services/logger";
import { ValidationError, getEventError } from "services/error-handler";
import type { ObservabilityService } from "services/observability";

const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY) || 10;

export interface TransformedEvent extends StatusPublishEvent {
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

function parseSqsMessageBody(
  sqsRecord: SQSRecord,
  observability: ObservabilityService,
): StatusPublishEvent {
  let parsed: any;
  try {
    parsed = JSON.parse(sqsRecord.body);

    observability.recordProcessingStarted({
      correlationId: extractCorrelationId(parsed),
      eventType: parsed?.type,
      clientId: parsed?.data?.clientId,
      messageId: parsed?.data?.messageId,
    });

    validateStatusTransitionEvent(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      `Failed to parse SQS message body as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      extractCorrelationId(parsed),
    );
  }
}

function processSingleEvent(
  event: StatusPublishEvent,
  observability: ObservabilityService,
): TransformedEvent {
  const correlationId = extractCorrelationId(event);
  const eventType = event.type;
  const { clientId, messageId } = event.data;

  observability.recordTransformationStarted({
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  const callbackPayload = transformEvent(event, correlationId);

  observability.recordCallbackGenerated(
    callbackPayload,
    eventType,
    correlationId,
    clientId,
  );

  return {
    ...event,
    transformedPayload: callbackPayload,
  };
}

function recordDeliveryInitiated(
  transformedEvents: TransformedEvent[],
  observability: ObservabilityService,
): void {
  for (const transformedEvent of transformedEvents) {
    const { clientId, messageId } = transformedEvent.data;
    const correlationId = extractCorrelationId(transformedEvent);

    observability.recordDeliveryInitiated({
      correlationId,
      eventType: transformedEvent.type,
      clientId,
      messageId,
    });
  }
}

async function transformBatch(
  sqsRecords: SQSRecord[],
  observability: ObservabilityService,
  stats: BatchStats,
): Promise<TransformedEvent[]> {
  return pMap(
    sqsRecords,
    (sqsRecord: SQSRecord) => {
      const event = parseSqsMessageBody(sqsRecord, observability);
      const correlationId = extractCorrelationId(event);

      const childObservability = observability.createChild({
        correlationId,
        eventType: event.type,
        clientId: event.data.clientId,
        messageId: event.data.messageId,
      });

      const transformedEvent = processSingleEvent(event, childObservability);
      stats.recordSuccess();
      return transformedEvent;
    },
    { concurrency: BATCH_CONCURRENCY, stopOnError: true },
  );
}

export async function processEvents(
  event: SQSRecord[],
  observability: ObservabilityService,
): Promise<TransformedEvent[]> {
  const startTime = Date.now();
  const stats = new BatchStats();

  try {
    const transformedEvents = await transformBatch(event, observability, stats);

    const processingTime = Date.now() - startTime;
    observability.logBatchProcessingCompleted({
      ...stats.toObject(),
      batchSize: event.length,
      processingTimeMs: processingTime,
    });

    recordDeliveryInitiated(transformedEvents, observability);

    await observability.flush();
    return transformedEvents;
  } catch (error) {
    stats.recordFailure();

    const wrappedError = getEventError(
      error,
      observability.getMetrics(),
      observability.getLogger(),
    );

    await observability.flush();
    throw wrappedError;
  }
}
