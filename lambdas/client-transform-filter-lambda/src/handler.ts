import type { SQSRecord } from "aws-lambda";
import pMap from "p-map";
import type {
  ClientCallbackPayload,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { validateStatusPublishEvent } from "services/validators/event-validator";
import { transformEvent } from "services/transformers/event-transformer";
import { extractCorrelationId, logger } from "services/logger";
import { ValidationError, getEventError } from "services/error-handler";
import type { ObservabilityService } from "services/observability";
import type { ConfigLoader } from "services/config-loader";
import { evaluateSubscriptionFilters } from "services/subscription-filter";
import type { ApplicationsMapService } from "services/ssm-applications-map";
import { signPayload } from "services/payload-signer";

const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY) || 10;
const MESSAGE_ROOT_URI = process.env.MESSAGE_ROOT_URI ?? "";

type UnsignedEvent = StatusPublishEvent & {
  transformedPayload: ClientCallbackPayload;
};

export interface TransformedEvent extends StatusPublishEvent {
  transformedPayload: ClientCallbackPayload;
  headers: { "x-hmac-sha256-signature": string };
}

class BatchStats {
  successful = 0;

  failed = 0;

  filtered = 0;

  processed = 0;

  recordSuccess(): void {
    this.successful += 1;
    this.processed += 1;
  }

  recordFailure(): void {
    this.failed += 1;
    this.processed += 1;
  }

  recordFiltered(): void {
    this.filtered += 1;
  }

  toObject() {
    return {
      successful: this.successful,
      failed: this.failed,
      filtered: this.filtered,
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

    validateStatusPublishEvent(parsed);
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
): UnsignedEvent {
  const correlationId = extractCorrelationId(event);
  const eventType = event.type;
  const { clientId, messageId } = event.data;

  observability.recordTransformationStarted({
    correlationId,
    eventType,
    clientId,
    messageId,
  });

  const callbackPayload = transformEvent(
    event,
    correlationId,
    MESSAGE_ROOT_URI,
  );

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

async function signBatch(
  filteredEvents: UnsignedEvent[],
  applicationsMapService: ApplicationsMapService,
  configLoader: ConfigLoader,
  stats: BatchStats,
): Promise<TransformedEvent[]> {
  const results = await pMap(
    filteredEvents,
    async (event): Promise<TransformedEvent | undefined> => {
      const { clientId } = event.data;
      const correlationId = extractCorrelationId(event);

      const applicationId =
        await applicationsMapService.getApplicationId(clientId);
      if (!applicationId) {
        stats.recordFiltered();
        logger.warn(
          "No applicationId found in SSM map - event will not be delivered",
          { clientId, correlationId },
        );
        return undefined;
      }

      const clientConfig = await configLoader.loadClientConfig(clientId);
      const apiKey = clientConfig?.[0]?.Targets?.[0]?.APIKey?.HeaderValue;
      if (!apiKey) {
        stats.recordFiltered();
        logger.warn(
          "No apiKey in client config - event will not be delivered",
          { clientId, correlationId },
        );
        return undefined;
      }

      const signature = signPayload(
        event.transformedPayload,
        applicationId,
        apiKey,
      );
      return { ...event, headers: { "x-hmac-sha256-signature": signature } };
    },
    { concurrency: BATCH_CONCURRENCY },
  );
  return results.filter((e): e is TransformedEvent => e !== undefined);
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

async function filterBatch(
  transformedEvents: UnsignedEvent[],
  configLoader: ConfigLoader,
  observability: ObservabilityService,
  stats: BatchStats,
): Promise<UnsignedEvent[]> {
  observability.recordFilteringStarted({ batchSize: transformedEvents.length });

  const uniqueClientIds = new Set(
    transformedEvents.map((e) => e.data.clientId),
  );

  const configEntries = await pMap(
    uniqueClientIds,
    async (clientId) => {
      const config = await configLoader.loadClientConfig(clientId);
      return [clientId, config] as const;
    },
    { concurrency: BATCH_CONCURRENCY },
  );

  const configByClientId = new Map(configEntries);

  const filtered: UnsignedEvent[] = [];

  for (const event of transformedEvents) {
    const { clientId } = event.data;
    const config = configByClientId.get(clientId);
    const filterResult = evaluateSubscriptionFilters(event, config);

    if (filterResult.matched) {
      filtered.push(event);
      const targetIds = config?.flatMap((s) =>
        s.Targets.map((t) => t.TargetId),
      );
      observability.recordFilteringMatched({
        clientId,
        eventType: event.type,
        subscriptionType: filterResult.subscriptionType,
        targetIds,
      });
    } else {
      stats.recordFiltered();
      observability
        .getLogger()
        .info("Event filtered out - no matching subscription", {
          clientId,
          eventType: event.type,
          subscriptionType: filterResult.subscriptionType,
        });
    }
  }

  return filtered;
}

async function transformBatch(
  sqsRecords: SQSRecord[],
  observability: ObservabilityService,
  stats: BatchStats,
): Promise<UnsignedEvent[]> {
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
  configLoader: ConfigLoader,
  applicationsMapService: ApplicationsMapService,
): Promise<TransformedEvent[]> {
  const startTime = Date.now();
  const stats = new BatchStats();

  try {
    const transformedEvents = await transformBatch(event, observability, stats);

    const filteredEvents = await filterBatch(
      transformedEvents,
      configLoader,
      observability,
      stats,
    );

    const signedEvents = await signBatch(
      filteredEvents,
      applicationsMapService,
      configLoader,
      stats,
    );

    const processingTime = Date.now() - startTime;
    observability.logBatchProcessingCompleted({
      ...stats.toObject(),
      batchSize: event.length,
      processingTimeMs: processingTime,
    });

    recordDeliveryInitiated(signedEvents, observability);

    await observability.flush();
    return signedEvents;
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
