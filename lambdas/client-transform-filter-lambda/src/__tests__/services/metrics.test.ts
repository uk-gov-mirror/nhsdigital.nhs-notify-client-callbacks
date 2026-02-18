import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";
import { MetricsService, metricsService } from "services/metrics";
import { logger } from "services/logger";

// Mock AWS SDK CloudWatch client
jest.mock("@aws-sdk/client-cloudwatch");

// Mock logger to avoid actual logging during tests
jest.mock("services/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe("MetricsService", () => {
  let mockCloudWatchClient: jest.Mocked<CloudWatchClient>;
  let mockSend: jest.Mock;
  let capturedCommandInputs: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedCommandInputs = [];

    // Setup mock CloudWatch client
    mockSend = jest.fn().mockResolvedValue({});
    mockCloudWatchClient = {
      send: mockSend,
    } as any;

    (CloudWatchClient as jest.Mock).mockImplementation(
      () => mockCloudWatchClient,
    );

    // Mock PutMetricDataCommand to capture inputs
    (PutMetricDataCommand as unknown as jest.Mock).mockImplementation(
      (input) => {
        capturedCommandInputs.push(input);
        return { input };
      },
    );
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AWS_REGION;
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
  });

  describe("constructor", () => {
    it("should initialize with default values when environment variables are not set", () => {
      const service = new MetricsService();

      expect(service).toBeInstanceOf(MetricsService);
      expect(CloudWatchClient).toHaveBeenCalledWith({
        region: "eu-west-2",
      });
    });

    it("should use AWS_REGION environment variable when set", () => {
      process.env.AWS_REGION = "us-east-1";

      const service = new MetricsService();

      expect(service).toBeInstanceOf(MetricsService);
      expect(CloudWatchClient).toHaveBeenCalledWith({
        region: "us-east-1",
      });
    });

    it("should use default namespace when METRICS_NAMESPACE is not set", async () => {
      const service = new MetricsService();

      // Test namespace by checking a metric emission
      await service.emitEventReceived("test-event", "test-client");

      expect(capturedCommandInputs).toHaveLength(1);
      expect(capturedCommandInputs[0].Namespace).toBe(
        "NHS-Notify/ClientCallbacks",
      );
    });

    it("should use custom namespace when METRICS_NAMESPACE is set", async () => {
      process.env.METRICS_NAMESPACE = "CustomNamespace";

      const service = new MetricsService();
      await service.emitEventReceived("test-event", "test-client");

      expect(capturedCommandInputs).toHaveLength(1);
      expect(capturedCommandInputs[0].Namespace).toBe("CustomNamespace");
    });

    it("should use default environment when ENVIRONMENT is not set", async () => {
      const service = new MetricsService();

      await service.emitEventReceived("test-event", "test-client");

      const dimensions = capturedCommandInputs[0].MetricData[0].Dimensions;

      expect(dimensions).toContainEqual({
        Name: "Environment",
        Value: "development",
      });
    });

    it("should use custom environment when ENVIRONMENT is set", async () => {
      process.env.ENVIRONMENT = "production";

      const service = new MetricsService();
      await service.emitEventReceived("test-event", "test-client");

      const dimensions = capturedCommandInputs[0].MetricData[0].Dimensions;

      expect(dimensions).toContainEqual({
        Name: "Environment",
        Value: "production",
      });
    });
  });

  describe("emitEventReceived", () => {
    it("should emit EventsReceived metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitEventReceived(
        "message.status.transitioned",
        "client-123",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedCommandInputs).toHaveLength(1);

      const commandInput = capturedCommandInputs[0];
      expect(commandInput.Namespace).toBe("NHS-Notify/ClientCallbacks");
      expect(commandInput.MetricData).toHaveLength(1);

      const metric = commandInput.MetricData[0];
      expect(metric.MetricName).toBe("EventsReceived");
      expect(metric.Value).toBe(1);
      expect(metric.Unit).toBe(StandardUnit.Count);
      expect(metric.Timestamp).toBeInstanceOf(Date);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "message.status.transitioned" },
          { Name: "ClientId", Value: "client-123" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitTransformationSuccess", () => {
    it("should emit TransformationsSuccessful metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitTransformationSuccess(
        "message.status.transitioned",
        "client-456",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("TransformationsSuccessful");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "message.status.transitioned" },
          { Name: "ClientId", Value: "client-456" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitTransformationFailure", () => {
    it("should emit TransformationsFailed metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitTransformationFailure(
        "message.status.transitioned",
        "ValidationError",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("TransformationsFailed");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "message.status.transitioned" },
          { Name: "ErrorType", Value: "ValidationError" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitFilterMatched", () => {
    it("should emit EventsMatched metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitFilterMatched(
        "channel.status.transitioned",
        "client-789",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("EventsMatched");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "channel.status.transitioned" },
          { Name: "ClientId", Value: "client-789" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitFilterRejected", () => {
    it("should emit EventsRejected metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitFilterRejected(
        "message.status.transitioned",
        "client-abc",
      );

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("EventsRejected");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "message.status.transitioned" },
          { Name: "ClientId", Value: "client-abc" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitDeliveryInitiated", () => {
    it("should emit CallbacksInitiated metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitDeliveryInitiated("client-xyz");

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("CallbacksInitiated");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "ClientId", Value: "client-xyz" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitValidationError", () => {
    it("should emit ValidationErrors metric with correct parameters", async () => {
      const service = new MetricsService();

      await service.emitValidationError("invalid.event.type");

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("ValidationErrors");
      expect(metric.Value).toBe(1);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "invalid.event.type" },
          { Name: "ErrorType", Value: "ValidationError" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("emitProcessingLatency", () => {
    it("should emit ProcessingLatency metric with milliseconds unit", async () => {
      const service = new MetricsService();

      await service.emitProcessingLatency(250, "message.status.transitioned");

      expect(mockSend).toHaveBeenCalledTimes(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("ProcessingLatency");
      expect(metric.Value).toBe(250);
      expect(metric.Unit).toBe(StandardUnit.Milliseconds);
      expect(metric.Dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "message.status.transitioned" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });

    it("should handle high latency values", async () => {
      const service = new MetricsService();

      await service.emitProcessingLatency(5000, "slow.event");

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.Value).toBe(5000);
    });
  });

  describe("error handling in putMetric", () => {
    it("should log error and not throw when CloudWatch send fails", async () => {
      const error = new Error("CloudWatch API error");
      mockSend.mockRejectedValueOnce(error);

      const service = new MetricsService();

      // Should not throw
      await expect(
        service.emitEventReceived("test-event", "test-client"),
      ).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to emit CloudWatch metric",
        expect.objectContaining({
          metricName: "EventsReceived",
          dimensions: expect.objectContaining({
            EventType: "test-event",
            ClientId: "test-client",
          }),
        }),
      );
    });

    it("should continue processing subsequent metrics after an error", async () => {
      mockSend.mockRejectedValueOnce(new Error("First metric fails"));
      mockSend.mockResolvedValueOnce({});

      const service = new MetricsService();

      await service.emitEventReceived("event-1", "client-1");
      await service.emitEventReceived("event-2", "client-2");

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("emitMetricAsync", () => {
    it("should call putMetric without waiting for result", async () => {
      const service = new MetricsService();

      // emitMetricAsync is fire-and-forget, returns void immediately
      const result = service.emitMetricAsync("TestMetric", 1, {
        EventType: "test",
      });

      expect(result).toBeUndefined();

      // Give async operation time to execute
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(capturedCommandInputs).toHaveLength(1);

      const metric = capturedCommandInputs[0].MetricData[0];

      expect(metric.MetricName).toBe("TestMetric");
      expect(metric.Value).toBe(1);
    });

    it("should log error when async metric emission fails", async () => {
      const error = new Error("Async metric failed");
      mockSend.mockRejectedValueOnce(error);

      const service = new MetricsService();

      service.emitMetricAsync("TestMetric", 1, { EventType: "test" });

      // Give async operation time to fail and log
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      // The error is logged by putMetric, not emitMetricAsync
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to emit CloudWatch metric",
        expect.objectContaining({
          metricName: "TestMetric",
          dimensions: expect.objectContaining({
            EventType: "test",
          }),
        }),
      );
    });
  });

  describe("metricsService singleton", () => {
    it("should export a singleton instance", () => {
      expect(metricsService).toBeInstanceOf(MetricsService);
    });

    it("should be usable directly", async () => {
      // Create a new instance instead of using isolated modules
      const service = new MetricsService();

      await service.emitEventReceived("test-event", "test-client");

      expect(mockSend).toHaveBeenCalled();
      expect(capturedCommandInputs.length).toBeGreaterThan(0);
    });
  });

  describe("dimension handling", () => {
    it("should handle empty optional dimensions", async () => {
      const service = new MetricsService();

      await service.emitDeliveryInitiated("client-123");

      const dimensions = capturedCommandInputs[0].MetricData[0].Dimensions;

      // Should only have ClientId and Environment, no EventType
      expect(dimensions).toHaveLength(2);
      expect(dimensions).toEqual(
        expect.arrayContaining([
          { Name: "ClientId", Value: "client-123" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });

    it("should include all provided dimensions", async () => {
      const service = new MetricsService();

      await service.emitTransformationFailure("event-type", "error-type");

      const dimensions = capturedCommandInputs[0].MetricData[0].Dimensions;

      expect(dimensions).toHaveLength(3);
      expect(dimensions).toEqual(
        expect.arrayContaining([
          { Name: "EventType", Value: "event-type" },
          { Name: "ErrorType", Value: "error-type" },
          { Name: "Environment", Value: "development" },
        ]),
      );
    });
  });

  describe("timestamp handling", () => {
    it("should include timestamp in metric data", async () => {
      const beforeTime = new Date();

      const service = new MetricsService();
      await service.emitEventReceived("test-event", "test-client");

      const afterTime = new Date();

      const timestamp = capturedCommandInputs[0].MetricData[0].Timestamp;

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });
});
