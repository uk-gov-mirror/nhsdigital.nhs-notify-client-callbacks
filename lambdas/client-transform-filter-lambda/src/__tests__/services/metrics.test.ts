import { Unit, createMetricsLogger } from "aws-embedded-metrics";
import { CallbackMetrics, createMetricLogger } from "services/metrics";

jest.mock("aws-embedded-metrics");

const mockPutMetric = jest.fn();
const mockSetProperty = jest.fn();
const mockSetDimensions = jest.fn();
const mockSetNamespace = jest.fn();
const mockFlush = jest.fn();

const mockMetricsLogger = {
  putMetric: mockPutMetric,
  setProperty: mockSetProperty,
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

  it("should throw if METRICS_NAMESPACE is not set", () => {
    process.env.ENVIRONMENT = "production";

    expect(() => createMetricLogger()).toThrow(
      "METRICS_NAMESPACE environment variable is not set",
    );
  });

  it("should throw if ENVIRONMENT is not set", () => {
    process.env.METRICS_NAMESPACE = "nhs-notify-client-callbacks-metrics";

    expect(() => createMetricLogger()).toThrow(
      "ENVIRONMENT environment variable is not set",
    );
  });

  it("should use METRICS_NAMESPACE environment variable", () => {
    process.env.METRICS_NAMESPACE = "CustomNamespace";
    process.env.ENVIRONMENT = "production";

    createMetricLogger();

    expect(mockSetNamespace).toHaveBeenCalledWith("CustomNamespace");
  });

  it("should use ENVIRONMENT environment variable", () => {
    process.env.METRICS_NAMESPACE = "nhs-notify-client-callbacks-metrics";
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
    it("should emit EventsReceived metric with correct properties", () => {
      callbackMetrics.emitEventReceived(
        "message.status.transitioned",
        "client-123",
      );

      expect(mockSetProperty).toHaveBeenCalledWith(
        "EventType",
        "message.status.transitioned",
      );
      expect(mockSetProperty).toHaveBeenCalledWith("ClientId", "client-123");
      expect(mockPutMetric).toHaveBeenCalledWith(
        "EventsReceived",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitTransformationSuccess", () => {
    it("should emit TransformationsSuccessful metric with correct properties", () => {
      callbackMetrics.emitTransformationSuccess(
        "channel.status.transitioned",
        "client-456",
      );

      expect(mockSetProperty).toHaveBeenCalledWith(
        "EventType",
        "channel.status.transitioned",
      );
      expect(mockSetProperty).toHaveBeenCalledWith("ClientId", "client-456");
      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsSuccessful",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitTransformationFailure", () => {
    it("should emit TransformationsFailed metric with correct properties", () => {
      callbackMetrics.emitTransformationFailure(
        "message.status.transitioned",
        "client-123",
        "ValidationError",
      );

      expect(mockSetProperty).toHaveBeenCalledWith(
        "EventType",
        "message.status.transitioned",
      );
      expect(mockSetProperty).toHaveBeenCalledWith("ClientId", "client-123");
      expect(mockSetProperty).toHaveBeenCalledWith(
        "ErrorType",
        "ValidationError",
      );
      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsFailed",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitDeliveryInitiated", () => {
    it("should emit CallbacksInitiated metric with correct properties", () => {
      callbackMetrics.emitDeliveryInitiated(
        "message.status.transitioned",
        "client-xyz",
      );

      expect(mockSetProperty).toHaveBeenCalledWith(
        "EventType",
        "message.status.transitioned",
      );
      expect(mockSetProperty).toHaveBeenCalledWith("ClientId", "client-xyz");
      expect(mockPutMetric).toHaveBeenCalledWith(
        "CallbacksInitiated",
        1,
        Unit.Count,
      );
    });
  });

  describe("emitValidationError", () => {
    it("should emit ValidationErrors metric with correct properties", () => {
      callbackMetrics.emitValidationError("invalid.event.type", "client-abc");

      expect(mockSetProperty).toHaveBeenCalledWith(
        "EventType",
        "invalid.event.type",
      );
      expect(mockSetProperty).toHaveBeenCalledWith("ClientId", "client-abc");
      expect(mockSetProperty).toHaveBeenCalledWith(
        "ErrorType",
        "ValidationError",
      );
      expect(mockPutMetric).toHaveBeenCalledWith(
        "ValidationErrors",
        1,
        Unit.Count,
      );
    });
  });
});
