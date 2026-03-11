import type { MetricsLogger } from "aws-embedded-metrics";
import type { ClientCallbackPayload } from "@nhs-notify-client-callbacks/models";
import { logCallbackGenerated } from "services/callback-logger";
import type { Logger } from "services/logger";
import { logLifecycleEvent } from "services/logger";
import type { CallbackMetrics } from "services/metrics";

export class ObservabilityService {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: CallbackMetrics,
    private readonly metricsLogger: MetricsLogger,
  ) {}

  getLogger(): Logger {
    return this.logger;
  }

  getMetrics(): CallbackMetrics {
    return this.metrics;
  }

  recordProcessingStarted(context: {
    correlationId?: string;
    eventType?: string;
    clientId?: string;
    messageId?: string;
  }): void {
    logLifecycleEvent(this.logger, "processing-started", context);
    this.metrics.emitEventReceived();
  }

  recordTransformationStarted(context: {
    correlationId?: string;
    eventType: string;
    clientId: string;
    messageId: string;
  }): void {
    logLifecycleEvent(this.logger, "transformation-started", context);
  }

  recordFilteringStarted(context: { batchSize: number }): void {
    logLifecycleEvent(this.logger, "filtering-started", context);
    this.metrics.emitFilteringStarted();
  }

  recordFilteringMatched(context: {
    clientId: string;
    eventType: string;
    subscriptionType: string;
    targetIds?: string[];
  }): void {
    logLifecycleEvent(this.logger, "filtering-matched", context);
    this.metrics.emitFilteringMatched();
  }

  logBatchProcessingCompleted(context: {
    successful: number;
    failed: number;
    filtered: number;
    processed: number;
    batchSize: number;
    processingTimeMs: number;
  }): void {
    logLifecycleEvent(this.logger, "batch-processing-completed", context);
  }

  recordDeliveryInitiated(context: {
    correlationId?: string;
    eventType: string;
    clientId: string;
    messageId: string;
  }): void {
    logLifecycleEvent(this.logger, "delivery-initiated", context);
    this.metrics.emitDeliveryInitiated();
  }

  recordCallbackGenerated(
    payload: ClientCallbackPayload,
    eventType: string,
    correlationId: string | undefined,
    clientId: string,
  ): void {
    logCallbackGenerated(
      this.logger,
      payload,
      eventType,
      correlationId,
      clientId,
    );
    this.metrics.emitTransformationSuccess();
  }

  createChild(context: {
    correlationId?: string;
    eventType: string;
    clientId: string;
    messageId: string;
  }): ObservabilityService {
    return new ObservabilityService(
      this.logger.child(context),
      this.metrics,
      this.metricsLogger,
    );
  }

  async flush(): Promise<void> {
    await this.metricsLogger.flush();
  }
}
