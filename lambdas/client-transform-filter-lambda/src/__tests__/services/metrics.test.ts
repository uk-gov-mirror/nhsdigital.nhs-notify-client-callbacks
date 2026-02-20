import { MetricHandler } from "services/metric-handler";
import { CallbackMetrics, createMetricHandler } from "services/metrics";

describe("MetricHandler", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
  });

  describe("addMetrics", () => {
    it("should emit EMF-formatted metric to console", () => {
      const handler = new MetricHandler("TestNamespace", [
        { Name: "Environment", Value: "test" },
      ]);

      handler.addMetrics(["TestMetric", "Count", 1], {
        extraDimensions: [{ Name: "ClientId", Value: "client-123" }],
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog).toMatchObject({
        _aws: {
          CloudWatchMetrics: [
            {
              Namespace: "TestNamespace",
              Dimensions: [["Environment", "ClientId"]],
              Metrics: [
                {
                  Name: "TestMetric",
                  Unit: "Count",
                  StorageResolution: 60,
                },
              ],
            },
          ],
        },
        Environment: "test",
        ClientId: "client-123",
        TestMetric: 1,
      });
      expect(emittedLog._aws.Timestamp).toEqual(expect.any(Number));
    });

    it("should support multiple metrics in one call", () => {
      const handler = new MetricHandler("TestNamespace", []);

      handler.addMetrics([
        ["Metric1", "Count", 1],
        ["Metric2", "Count", 5],
        ["Metric3", "Milliseconds", 250],
      ]);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog.Metric1).toBe(1);
      expect(emittedLog.Metric2).toBe(5);
      expect(emittedLog.Metric3).toBe(250);
      expect(emittedLog._aws.CloudWatchMetrics[0].Metrics).toHaveLength(3);
    });

    it("should use custom timestamp when provided", () => {
      const handler = new MetricHandler("TestNamespace", []);
      const customTime = new Date("2026-02-20T10:00:00Z");

      handler.addMetrics(["TestMetric", "Count", 1], {
        timestamp: customTime,
      });

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog._aws.Timestamp).toBe(customTime.valueOf());
    });

    it("should support custom storage resolution", () => {
      const handler = new MetricHandler("TestNamespace", []);

      handler.addMetrics(["TestMetric", "Count", 1], {
        storageResolution: 1,
      });

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(
        emittedLog._aws.CloudWatchMetrics[0].Metrics[0].StorageResolution,
      ).toBe(1);
    });

    it("should merge base dimensions with extra dimensions", () => {
      const handler = new MetricHandler("TestNamespace", [
        { Name: "Environment", Value: "production" },
        { Name: "Service", Value: "callbacks" },
      ]);

      handler.addMetrics(["TestMetric", "Count", 1], {
        extraDimensions: [
          { Name: "ClientId", Value: "client-abc" },
          { Name: "EventType", Value: "test-event" },
        ],
      });

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog.Environment).toBe("production");
      expect(emittedLog.Service).toBe("callbacks");
      expect(emittedLog.ClientId).toBe("client-abc");
      expect(emittedLog.EventType).toBe("test-event");
      expect(emittedLog._aws.CloudWatchMetrics[0].Dimensions[0]).toEqual([
        "Environment",
        "Service",
        "ClientId",
        "EventType",
      ]);
    });
  });

  describe("getChildMetricHandler", () => {
    it("should create child handler with combined dimensions", () => {
      const parentHandler = new MetricHandler("TestNamespace", [
        { Name: "Environment", Value: "test" },
      ]);

      const childHandler = parentHandler.getChildMetricHandler([
        { Name: "RequestId", Value: "req-123" },
      ]);

      childHandler.addMetrics(["ChildMetric", "Count", 1]);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog.Environment).toBe("test");
      expect(emittedLog.RequestId).toBe("req-123");
    });

    it("should not affect parent handler dimensions", () => {
      const parentHandler = new MetricHandler("TestNamespace", [
        { Name: "Environment", Value: "test" },
      ]);

      parentHandler.getChildMetricHandler([
        { Name: "RequestId", Value: "req-123" },
      ]);

      parentHandler.addMetrics(["ParentMetric", "Count", 1]);

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog.Environment).toBe("test");
      expect(emittedLog.RequestId).toBeUndefined();
    });
  });

  describe("DIMENSION_NOT_APPLICABLE constant", () => {
    it("should expose NOT_APPLICABLE constant", () => {
      expect(MetricHandler.DIMENSION_NOT_APPLICABLE).toBe("not_applicable");
    });

    it("should work with NOT_APPLICABLE in dimensions", () => {
      const handler = new MetricHandler("TestNamespace", []);

      handler.addMetrics(["TestMetric", "Count", 1], {
        extraDimensions: [
          { Name: "CampaignId", Value: MetricHandler.DIMENSION_NOT_APPLICABLE },
        ],
      });

      const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(emittedLog.CampaignId).toBe("not_applicable");
    });
  });
});

describe("createMetricHandler", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
  });

  it("should create MetricHandler with default namespace and environment", () => {
    const handler = createMetricHandler();

    handler.addMetrics(["TestMetric", "Count", 1]);

    const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(emittedLog._aws.CloudWatchMetrics[0].Namespace).toBe(
      "NHS-Notify/ClientCallbacks",
    );
    expect(emittedLog.Environment).toBe("development");
  });

  it("should use METRICS_NAMESPACE environment variable", () => {
    process.env.METRICS_NAMESPACE = "CustomNamespace";

    const handler = createMetricHandler();

    handler.addMetrics(["TestMetric", "Count", 1]);

    const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(emittedLog._aws.CloudWatchMetrics[0].Namespace).toBe(
      "CustomNamespace",
    );
  });

  it("should use ENVIRONMENT environment variable", () => {
    process.env.ENVIRONMENT = "production";

    const handler = createMetricHandler();

    handler.addMetrics(["TestMetric", "Count", 1]);

    const emittedLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(emittedLog.Environment).toBe("production");
  });
});

describe("CallbackMetrics", () => {
  let mockMetricHandler: jest.Mocked<MetricHandler>;
  let callbackMetrics: CallbackMetrics;

  beforeEach(() => {
    mockMetricHandler = {
      addMetrics: jest.fn(),
      getChildMetricHandler: jest.fn(),
    } as any;

    callbackMetrics = new CallbackMetrics(mockMetricHandler);
  });

  describe("emitEventReceived", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitEventReceived(
        "message.status.transitioned",
        "client-123",
      );

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["EventsReceived", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "message.status.transitioned" },
            { Name: "ClientId", Value: "client-123" },
          ],
        },
      );
    });
  });

  describe("emitTransformationSuccess", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitTransformationSuccess(
        "channel.status.transitioned",
        "client-456",
      );

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["TransformationsSuccessful", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "channel.status.transitioned" },
            { Name: "ClientId", Value: "client-456" },
          ],
        },
      );
    });
  });

  describe("emitTransformationFailure", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitTransformationFailure(
        "message.status.transitioned",
        "ValidationError",
      );

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["TransformationsFailed", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "message.status.transitioned" },
            { Name: "ErrorType", Value: "ValidationError" },
          ],
        },
      );
    });
  });

  describe("emitFilterMatched", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitFilterMatched(
        "message.status.transitioned",
        "client-789",
      );

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["EventsMatched", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "message.status.transitioned" },
            { Name: "ClientId", Value: "client-789" },
          ],
        },
      );
    });
  });

  describe("emitFilterRejected", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitFilterRejected(
        "channel.status.transitioned",
        "client-abc",
      );

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["EventsRejected", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "channel.status.transitioned" },
            { Name: "ClientId", Value: "client-abc" },
          ],
        },
      );
    });
  });

  describe("emitDeliveryInitiated", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitDeliveryInitiated("client-xyz");

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["CallbacksInitiated", "Count", 1],
        {
          extraDimensions: [{ Name: "ClientId", Value: "client-xyz" }],
        },
      );
    });
  });

  describe("emitValidationError", () => {
    it("should call addMetrics with correct parameters", () => {
      callbackMetrics.emitValidationError("invalid.event.type");

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["ValidationErrors", "Count", 1],
        {
          extraDimensions: [
            { Name: "EventType", Value: "invalid.event.type" },
            { Name: "ErrorType", Value: "ValidationError" },
          ],
        },
      );
    });
  });

  describe("emitProcessingLatency", () => {
    it("should call addMetrics with Milliseconds unit", () => {
      callbackMetrics.emitProcessingLatency(250, "message.status.transitioned");

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["ProcessingLatency", "Milliseconds", 250],
        {
          extraDimensions: [
            { Name: "EventType", Value: "message.status.transitioned" },
          ],
        },
      );
    });

    it("should handle high latency values", () => {
      callbackMetrics.emitProcessingLatency(5000, "slow.event");

      expect(mockMetricHandler.addMetrics).toHaveBeenCalledWith(
        ["ProcessingLatency", "Milliseconds", 5000],
        {
          extraDimensions: [{ Name: "EventType", Value: "slow.event" }],
        },
      );
    });
  });
});
