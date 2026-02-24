import { Unit, createMetricsLogger } from "aws-embedded-metrics";
import type { MetricsLogger } from "aws-embedded-metrics";

export const createMetricLogger = (): MetricsLogger => {
  const namespace =
    process.env.METRICS_NAMESPACE || "nhs-notify-client-callbacks-metrics";
  const environment = process.env.ENVIRONMENT || "development";

  const metrics = createMetricsLogger();
  metrics.setNamespace(namespace);
  metrics.setDimensions({ Environment: environment });

  return metrics;
};

export class CallbackMetrics {
  constructor(private readonly metrics: MetricsLogger) {}

  emitEventReceived(eventType: string, clientId: string): void {
    this.metrics.setDimensions({ EventType: eventType, ClientId: clientId });
    this.metrics.putMetric("EventsReceived", 1, Unit.Count);
  }

  emitTransformationSuccess(eventType: string, clientId: string): void {
    this.metrics.setDimensions({ EventType: eventType, ClientId: clientId });
    this.metrics.putMetric("TransformationsSuccessful", 1, Unit.Count);
  }

  emitTransformationFailure(eventType: string, errorType: string): void {
    this.metrics.setDimensions({ EventType: eventType, ErrorType: errorType });
    this.metrics.putMetric("TransformationsFailed", 1, Unit.Count);
  }

  emitDeliveryInitiated(clientId: string): void {
    this.metrics.setDimensions({ ClientId: clientId });
    this.metrics.putMetric("CallbacksInitiated", 1, Unit.Count);
  }

  emitValidationError(eventType: string): void {
    this.metrics.setDimensions({
      EventType: eventType,
      ErrorType: "ValidationError",
    });
    this.metrics.putMetric("ValidationErrors", 1, Unit.Count);
  }
}
