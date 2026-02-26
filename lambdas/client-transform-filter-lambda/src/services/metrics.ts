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

  emitEventReceived(eventType: string, clientId: string): void {
    this.metrics.setProperty("EventType", eventType);
    this.metrics.setProperty("ClientId", clientId);
    this.metrics.putMetric("EventsReceived", 1, Unit.Count);
  }

  emitTransformationSuccess(eventType: string, clientId: string): void {
    this.metrics.setProperty("EventType", eventType);
    this.metrics.setProperty("ClientId", clientId);
    this.metrics.putMetric("TransformationsSuccessful", 1, Unit.Count);
  }

  emitTransformationFailure(
    eventType: string,
    clientId: string,
    errorType: string,
  ): void {
    this.metrics.setProperty("EventType", eventType);
    this.metrics.setProperty("ClientId", clientId);
    this.metrics.setProperty("ErrorType", errorType);
    this.metrics.putMetric("TransformationsFailed", 1, Unit.Count);
  }

  emitDeliveryInitiated(eventType: string, clientId: string): void {
    this.metrics.setProperty("EventType", eventType);
    this.metrics.setProperty("ClientId", clientId);
    this.metrics.putMetric("CallbacksInitiated", 1, Unit.Count);
  }

  emitValidationError(eventType: string, clientId: string): void {
    this.metrics.setProperty("EventType", eventType);
    this.metrics.setProperty("ClientId", clientId);
    this.metrics.setProperty("ErrorType", "ValidationError");
    this.metrics.putMetric("ValidationErrors", 1, Unit.Count);
  }
}
