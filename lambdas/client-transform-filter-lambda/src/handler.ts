import type { SQSRecord } from "aws-lambda";
import pMap from "p-map";
import type {
  ClientCallbackPayload,
  ClientSubscriptionConfiguration,
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

type FilteredEvent = UnsignedEvent & {
  subscriptionIds: string[];
  targetIds: string[];
};

type SignedEvent = {
  transformedEvent: TransformedEvent;
  deliveryContext: {
    correlationId: string;
    eventType: string;
    clientId: string;
    messageId: string;
  };
};

export interface TransformedEvent {
  payload: ClientCallbackPayload;
  subscriptions: string[];
  signatures: Record<string, string>;
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

type ClientConfigMap = Map<string, ClientSubscriptionConfiguration | undefined>;

async function signBatch(
  filteredEvents: FilteredEvent[],
  applicationsMapService: ApplicationsMapService,
  configByClientId: ClientConfigMap,
  stats: BatchStats,
  observability: ObservabilityService,
): Promise<SignedEvent[]> {
  const results = await pMap(
    filteredEvents,
    async (event): Promise<SignedEvent | undefined> => {
      const { clientId } = event.data;
      const correlationId = extractCorrelationId(event) ?? event.id;

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

      const clientConfig = configByClientId.get(clientId);
      const targetsById = new Map(
        (clientConfig?.targets ?? []).map((t) => [t.targetId, t]),
      );

      const signaturesByTarget = new Map<string, string>();

      for (const targetId of event.targetIds) {
        const target = targetsById.get(targetId);
        const apiKey = target?.apiKey?.headerValue;
        if (!apiKey) {
          throw new ValidationError(
            `Missing apiKey for target ${targetId}`,
            correlationId,
          );
        }
        const signature = signPayload(
          event.transformedPayload,
          applicationId,
          apiKey,
        );
        signaturesByTarget.set(targetId.replaceAll("-", "_"), signature);
        observability.recordCallbackSigned(
          event.transformedPayload,
          correlationId,
          clientId,
          signature,
        );
      }

      return {
        transformedEvent: {
          payload: event.transformedPayload,
          subscriptions: event.subscriptionIds,
          signatures: Object.fromEntries(signaturesByTarget),
        },
        deliveryContext: {
          correlationId,
          eventType: event.type,
          clientId,
          messageId: event.data.messageId,
        },
      };
    },
    { concurrency: BATCH_CONCURRENCY },
  );
  return results.filter((e): e is SignedEvent => e !== undefined);
}

async function loadClientConfigs(
  events: UnsignedEvent[],
  configLoader: ConfigLoader,
): Promise<ClientConfigMap> {
  const uniqueClientIds = new Set(events.map((e) => e.data.clientId));
  const entries = await pMap(
    uniqueClientIds,
    async (clientId) => {
      const config = await configLoader.loadClientConfig(clientId);
      return [clientId, config] as const;
    },
    { concurrency: BATCH_CONCURRENCY },
  );
  return new Map(entries);
}

async function filterBatch(
  transformedEvents: UnsignedEvent[],
  configByClientId: ClientConfigMap,
  observability: ObservabilityService,
  stats: BatchStats,
): Promise<FilteredEvent[]> {
  observability.recordFilteringStarted({ batchSize: transformedEvents.length });

  const filtered: FilteredEvent[] = [];

  for (const event of transformedEvents) {
    const { clientId } = event.data;
    const correlationId = extractCorrelationId(event);
    const config = configByClientId.get(clientId);
    const filterResult = evaluateSubscriptionFilters(event, config);

    if (filterResult.matched) {
      filtered.push({
        ...event,
        subscriptionIds: filterResult.subscriptionIds ?? [],
        targetIds: filterResult.targetIds ?? [],
      });
      observability.recordFilteringMatched({
        correlationId,
        clientId,
        eventType: event.type,
        subscriptionType: filterResult.subscriptionType,
        targetIds: filterResult.targetIds,
      });
    } else {
      stats.recordFiltered();
      observability
        .getLogger()
        .info("Event filtered out - no matching subscription", {
          correlationId,
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

    const configByClientId = await loadClientConfigs(
      transformedEvents,
      configLoader,
    );

    const filteredEvents = await filterBatch(
      transformedEvents,
      configByClientId,
      observability,
      stats,
    );

    const signedEvents = await signBatch(
      filteredEvents,
      applicationsMapService,
      configByClientId,
      stats,
      observability,
    );

    for (const signedEvent of signedEvents) {
      observability.recordDeliveryInitiated(signedEvent.deliveryContext);
    }

    const deliverableEvents = signedEvents.map(
      (signedEvent) => signedEvent.transformedEvent,
    );

    const processingTime = Date.now() - startTime;
    observability.logBatchProcessingCompleted({
      ...stats.toObject(),
      batchSize: event.length,
      processingTimeMs: processingTime,
    });

    await observability.flush();
    return deliverableEvents;
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
