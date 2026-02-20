import { Unit, createMetricsLogger } from "aws-embedded-metrics";
import { CallbackMetrics, createMetricLogger } from "services/metrics";

jest.mock("aws-embedded-metrics");

const mockPutMetric = jest.fn();
const mockSetDimensions = jest.fn();
const mockSetNamespace = jest.fn();
const mockFlush = jest.fn();

const mockMetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: mockSetDimensions,
  setNamespace: mockSetNamespace,
  flush: mockFlush,
};

(createMetricsLogger as jest.Mock).mockReturnValue(mockMetricsLogger);

describe("createMetricsLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
  });

  it("should create metrics logger with default namespace and environment", () => {
    createMetricLogger();

    expect(mockSetNamespace).toHaveBeenCalledWith(
      "nhs-notify-client-callbacks-metrics",
    );
    expect(mockSetDimensions).toHaveBeenCalledWith({
      Environment: "development",
    });
  });

  it("should use METRICS_NAMESPACE environment variable", () => {
    process.env.METRICS_NAMESPACE = "CustomNamespace";

    createMetricLogger();

    expect(mockSetNamespace).toHaveBeenCalledWith("CustomNamespace");
  });

  it("should use ENVIRONMENT environment variable", () => {
    process.env.ENVIRONMENT = "production";

    createMetricLogger();

    expect(mockSetDimensions).toHaveBeenCalledWith({
      Environment: "production",
    });
  });
});

describe("CallbackMetrics", () => {
  let callbackMetrics: CallbackMetrics;

  beforeEach(() => {
    jest.clearAllMocks();
    callbackMetrics = new CallbackMetrics(mockMetricsLogger as any);
  });

  describe("emitEventReceived", () => {
    it("should emit EventsReceived metric with correct dimensions", () => {
      callbackMetrics.emitEventReceived(
        "message.status.transitioned",
        "client-123",
      );

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "message.status.transitioned",
        ClientId: "client-123",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "EventsReceived",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitTransformationSuccess", () => {
    it("should emit TransformationsSuccessful metric with correct dimensions", () => {
      callbackMetrics.emitTransformationSuccess(
        "channel.status.transitioned",
        "client-456",
      );

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "channel.status.transitioned",
        ClientId: "client-456",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsSuccessful",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitTransformationFailure", () => {
    it("should emit TransformationsFailed metric with correct dimensions", () => {
      callbackMetrics.emitTransformationFailure(
        "message.status.transitioned",
        "ValidationError",
      );

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "message.status.transitioned",
        ErrorType: "ValidationError",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsFailed",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitFilterMatched", () => {
    it("should emit EventsMatched metric with correct dimensions", () => {
      callbackMetrics.emitFilterMatched(
        "message.status.transitioned",
        "client-789",
      );

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "message.status.transitioned",
        ClientId: "client-789",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "EventsMatched",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitFilterRejected", () => {
    it("should emit EventsRejected metric with correct dimensions", () => {
      callbackMetrics.emitFilterRejected(
        "channel.status.transitioned",
        "client-abc",
      );

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "channel.status.transitioned",
        ClientId: "client-abc",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "EventsRejected",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitDeliveryInitiated", () => {
    it("should emit CallbacksInitiated metric with correct dimensions", () => {
      callbackMetrics.emitDeliveryInitiated("client-xyz");

      expect(mockSetDimensions).toHaveBeenCalledWith({
        ClientId: "client-xyz",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "CallbacksInitiated",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitValidationError", () => {
    it("should emit ValidationErrors metric with correct dimensions", () => {
      callbackMetrics.emitValidationError("invalid.event.type");

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "invalid.event.type",
        ErrorType: "ValidationError",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "ValidationErrors",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitProcessingLatency", () => {
    it("should emit ProcessingLatency metric with Milliseconds unit", () => {
      callbackMetrics.emitProcessingLatency(250, "message.status.transitioned");

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "message.status.transitioned",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "ProcessingLatency",
        250,
        Unit.Milliseconds,
      );
    });

    it("should handle high latency values", () => {
      callbackMetrics.emitProcessingLatency(5000, "slow.event");

      expect(mockSetDimensions).toHaveBeenCalledWith({
        EventType: "slow.event",
      });
      expect(mockPutMetric).toHaveBeenCalledWith(
        "ProcessingLatency",
        5000,
        Unit.Milliseconds,
      );
    });
  });
});
