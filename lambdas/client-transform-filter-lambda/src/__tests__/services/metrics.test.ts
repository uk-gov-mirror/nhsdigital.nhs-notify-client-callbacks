import { StorageResolution, Unit, createMetricsLogger } from "aws-embedded-metrics";
import { CallbackMetrics, createMetricLogger } from "services/metrics";

jest.mock("aws-embedded-metrics", () => ({
  Unit: { Count: "Count" },
  StorageResolution: { High: 1, Standard: 60 },
  createMetricsLogger: jest.fn(),
}));

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
    it("should emit EventsReceived metric", () => {
      callbackMetrics.emitEventReceived();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "EventsReceived",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitTransformationSuccess", () => {
    it("should emit TransformationsSuccessful metric", () => {
      callbackMetrics.emitTransformationSuccess();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsSuccessful",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitTransformationFailure", () => {
    it("should emit TransformationsFailed metric", () => {
      callbackMetrics.emitTransformationFailure();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "TransformationsFailed",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitDeliveryInitiated", () => {
    it("should emit CallbacksInitiated metric", () => {
      callbackMetrics.emitDeliveryInitiated();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "CallbacksInitiated",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitValidationError", () => {
    it("should emit ValidationErrors metric", () => {
      callbackMetrics.emitValidationError();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "ValidationErrors",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitFilteringStarted", () => {
    it("should emit FilteringStarted metric", () => {
      callbackMetrics.emitFilteringStarted();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "FilteringStarted",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });

  describe("emitFilteringMatched", () => {
    it("should emit FilteringMatched metric", () => {
      callbackMetrics.emitFilteringMatched();

      expect(mockPutMetric).toHaveBeenCalledWith(
        "FilteringMatched",
        1,
        Unit.Count,
        StorageResolution.High,
      );
    });
  });
});
