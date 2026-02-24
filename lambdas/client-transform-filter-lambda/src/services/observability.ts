import type { MetricsLogger } from "aws-embedded-metrics";
import type { ClientCallbackPayload } from "models";
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
    if (context.eventType && context.clientId) {
      this.metrics.emitEventReceived(context.eventType, context.clientId);
    }
  }

  recordTransformationStarted(context: {
    correlationId?: string;
    eventType: string;
    clientId: string;
    messageId: string;
  }): void {
    logLifecycleEvent(this.logger, "transformation-started", context);
  }

  logBatchProcessingCompleted(context: {
    successful: number;
    failed: number;
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
    this.metrics.emitDeliveryInitiated(context.clientId);
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
    this.metrics.emitTransformationSuccess(eventType, clientId);
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
