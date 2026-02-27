import { Unit, createMetricsLogger } from "aws-embedded-metrics";
import type { MetricsLogger } from "aws-embedded-metrics";

export const createMetricLogger = (): MetricsLogger => {
  const namespace = process.env.METRICS_NAMESPACE;
  const environment = process.env.ENVIRONMENT;

  if (!namespace)
    throw new Error("METRICS_NAMESPACE environment variable is not set");
  if (!environment)
    throw new Error("ENVIRONMENT environment variable is not set");

  const metrics = createMetricsLogger();
  metrics.setNamespace(namespace);
  metrics.setDimensions({ Environment: environment });

  return metrics;
};

export class CallbackMetrics {
  constructor(private readonly metrics: MetricsLogger) {}

  emitEventReceived(): void {
    this.metrics.putMetric("EventsReceived", 1, Unit.Count);
  }

  emitTransformationSuccess(): void {
    this.metrics.putMetric("TransformationsSuccessful", 1, Unit.Count);
  }

  emitTransformationFailure(): void {
    this.metrics.putMetric("TransformationsFailed", 1, Unit.Count);
  }

  emitDeliveryInitiated(): void {
    this.metrics.putMetric("CallbacksInitiated", 1, Unit.Count);
  }

  emitValidationError(): void {
    this.metrics.putMetric("ValidationErrors", 1, Unit.Count);
  }
}
