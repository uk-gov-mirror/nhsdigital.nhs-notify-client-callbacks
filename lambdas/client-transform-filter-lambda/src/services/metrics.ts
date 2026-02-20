import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";
import { logger } from "services/logger";
import { formatErrorForLogging } from "services/error-handler";

export interface MetricDimensions {
  EventType?: string;
  ClientId?: string;
  ErrorType?: string;
  Environment?: string;
}

export class MetricsService {
  private readonly cloudWatchClient: CloudWatchClient;

  private readonly namespace: string;

  private readonly environment: string;

  constructor() {
    this.cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || "eu-west-2",
    });
    this.namespace =
      process.env.METRICS_NAMESPACE || "NHS-Notify/ClientCallbacks"; // TODO - CCM-14200 - what should the namespace be for these metrics?
    this.environment = process.env.ENVIRONMENT || "development";
  }

  async emitEventReceived(eventType: string, clientId: string): Promise<void> {
    await this.putMetric("EventsReceived", 1, {
      EventType: eventType,
      ClientId: clientId,
      Environment: this.environment,
    });
  }

  async emitTransformationSuccess(
    eventType: string,
    clientId: string,
  ): Promise<void> {
    await this.putMetric("TransformationsSuccessful", 1, {
      EventType: eventType,
      ClientId: clientId,
      Environment: this.environment,
    });
  }

  async emitTransformationFailure(
    eventType: string,
    errorType: string,
  ): Promise<void> {
    await this.putMetric("TransformationsFailed", 1, {
      EventType: eventType,
      ErrorType: errorType,
      Environment: this.environment,
    });
  }

  async emitFilterMatched(eventType: string, clientId: string): Promise<void> {
    await this.putMetric("EventsMatched", 1, {
      EventType: eventType,
      ClientId: clientId,
      Environment: this.environment,
    });
  }

  async emitFilterRejected(eventType: string, clientId: string): Promise<void> {
    await this.putMetric("EventsRejected", 1, {
      EventType: eventType,
      ClientId: clientId,
      Environment: this.environment,
    });
  }

  async emitDeliveryInitiated(clientId: string): Promise<void> {
    await this.putMetric("CallbacksInitiated", 1, {
      ClientId: clientId,
      Environment: this.environment,
    });
  }

  async emitValidationError(eventType: string): Promise<void> {
    await this.putMetric("ValidationErrors", 1, {
      EventType: eventType,
      ErrorType: "ValidationError",
      Environment: this.environment,
    });
  }

  async emitProcessingLatency(
    latency: number,
    eventType: string,
  ): Promise<void> {
    await this.putMetric(
      "ProcessingLatency",
      latency,
      {
        EventType: eventType,
        Environment: this.environment,
      },
      StandardUnit.Milliseconds,
    );
  }

  private async putMetric(
    metricName: string,
    value: number,
    dimensions: MetricDimensions,
    unit: StandardUnit = StandardUnit.Count,
  ): Promise<void> {
    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
              Name,
              Value,
            })),
          },
        ],
      });

      await this.cloudWatchClient.send(command);
    } catch (error) {
      logger.error("Failed to emit CloudWatch metric", {
        errorDetails: formatErrorForLogging(error),
        metricName,
        dimensions,
      });
    }
  }

  emitMetricAsync(
    metricName: string,
    value: number,
    dimensions: MetricDimensions,
  ): void {
    this.putMetric(metricName, value, dimensions).catch((error) => {
      logger.error("Failed to emit async metric", {
        errorDetails: formatErrorForLogging(error),
        metricName,
        dimensions,
      });
    });
  }
}

export const metricsService = new MetricsService();
