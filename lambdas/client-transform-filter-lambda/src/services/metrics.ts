import { MetricHandler } from "services/metric-handler";

export const createMetricHandler = (): MetricHandler => {
  const namespace =
    process.env.METRICS_NAMESPACE || "nhs-notify-client-callbacks-metrics";
  const environment = process.env.ENVIRONMENT || "development";

  return new MetricHandler(namespace, [
    {
      Name: "Environment",
      Value: environment,
    },
  ]);
};

/**
 * Uses EMF instead of direct CloudWatch API calls for:
 * - Better performance (no network latency)
 * - Lower cost (no PutMetricData API charges)
 * - Easier testing (simple console.log mocking)
 */
export class CallbackMetrics {
  constructor(private readonly metricHandler: MetricHandler) {}

  emitEventReceived(eventType: string, clientId: string): void {
    this.metricHandler.addMetrics(["EventsReceived", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ClientId", Value: clientId },
      ],
    });
  }

  emitTransformationSuccess(eventType: string, clientId: string): void {
    this.metricHandler.addMetrics(["TransformationsSuccessful", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ClientId", Value: clientId },
      ],
    });
  }

  emitTransformationFailure(eventType: string, errorType: string): void {
    this.metricHandler.addMetrics(["TransformationsFailed", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ErrorType", Value: errorType },
      ],
    });
  }

  emitFilterMatched(eventType: string, clientId: string): void {
    this.metricHandler.addMetrics(["EventsMatched", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ClientId", Value: clientId },
      ],
    });
  }

  emitFilterRejected(eventType: string, clientId: string): void {
    this.metricHandler.addMetrics(["EventsRejected", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ClientId", Value: clientId },
      ],
    });
  }

  emitDeliveryInitiated(clientId: string): void {
    this.metricHandler.addMetrics(["CallbacksInitiated", "Count", 1], {
      extraDimensions: [{ Name: "ClientId", Value: clientId }],
    });
  }

  emitValidationError(eventType: string): void {
    this.metricHandler.addMetrics(["ValidationErrors", "Count", 1], {
      extraDimensions: [
        { Name: "EventType", Value: eventType },
        { Name: "ErrorType", Value: "ValidationError" },
      ],
    });
  }

  emitProcessingLatency(latency: number, eventType: string): void {
    this.metricHandler.addMetrics(
      ["ProcessingLatency", "Milliseconds", latency],
      {
        extraDimensions: [{ Name: "EventType", Value: eventType }],
      },
    );
  }
}

export { type MetricDimension, MetricHandler } from "services/metric-handler";
