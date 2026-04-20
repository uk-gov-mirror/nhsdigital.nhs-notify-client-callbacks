const mockCreateMetricsLogger = jest.fn();
jest.mock("aws-embedded-metrics", () => ({
  Unit: { Count: "Count", Milliseconds: "Milliseconds" },
  createMetricsLogger: () => mockCreateMetricsLogger(),
}));

describe("delivery-metrics", () => {
  const mockMetrics = {
    setNamespace: jest.fn(),
    setDimensions: jest.fn(),
    setProperty: jest.fn(),
    putMetric: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCreateMetricsLogger.mockReturnValue(mockMetrics);
    process.env.METRICS_NAMESPACE = "TestNamespace";
    process.env.ENVIRONMENT = "test";
  });

  afterEach(() => {
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
  });

  it("throws when METRICS_NAMESPACE is not set", async () => {
    delete process.env.METRICS_NAMESPACE;
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliveryAttempt } = await import("services/delivery-metrics");

    expect(() => emitDeliveryAttempt("t-1")).toThrow(
      "METRICS_NAMESPACE environment variable is not set",
    );
  });

  it("throws when ENVIRONMENT is not set", async () => {
    delete process.env.ENVIRONMENT;
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliveryAttempt } = await import("services/delivery-metrics");

    expect(() => emitDeliveryAttempt("t-1")).toThrow(
      "ENVIRONMENT environment variable is not set",
    );
  });

  it("creates metrics logger with correct namespace and dimensions", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliveryAttempt } = await import("services/delivery-metrics");

    emitDeliveryAttempt("t-1");

    expect(mockMetrics.setNamespace).toHaveBeenCalledWith("TestNamespace");
    expect(mockMetrics.setDimensions).toHaveBeenCalledWith({
      Environment: "test",
    });
  });

  it("caches the metrics logger on subsequent calls", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitDeliveryAttempt, emitDeliverySuccess } = mod;

    emitDeliveryAttempt("t-1");
    emitDeliverySuccess("t-1");

    expect(mockCreateMetricsLogger).toHaveBeenCalledTimes(1);
  });

  it("emitDeliveryAttempt emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliveryAttempt } = await import("services/delivery-metrics");

    emitDeliveryAttempt("target-42");

    expect(mockMetrics.setProperty).toHaveBeenCalledWith(
      "targetId",
      "target-42",
    );
    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryAttempt",
      1,
      "Count",
    );
  });

  it("emitDeliverySuccess emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliverySuccess } = await import("services/delivery-metrics");

    emitDeliverySuccess("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliverySuccess",
      1,
      "Count",
    );
  });

  it("emitDeliveryFailure emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const { emitDeliveryFailure } = await import("services/delivery-metrics");

    emitDeliveryFailure("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryFailure",
      1,
      "Count",
    );
  });

  it("emitDeliveryPermanentFailure emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitDeliveryPermanentFailure } = mod;

    emitDeliveryPermanentFailure("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryPermanentFailure",
      1,
      "Count",
    );
  });

  it("emitCircuitBreakerOpen emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitCircuitBreakerOpen } = mod;

    emitCircuitBreakerOpen("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "CircuitBreakerOpen",
      1,
      "Count",
    );
  });

  it("emitRateLimited emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitRateLimited } = mod;

    emitRateLimited("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryRateLimited",
      1,
      "Count",
    );
  });

  it("emitCircuitBreakerClosed emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitCircuitBreakerClosed } = mod;

    emitCircuitBreakerClosed("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "CircuitBreakerClosed",
      1,
      "Count",
    );
  });

  it("emitRetryWindowExhausted emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitRetryWindowExhausted } = mod;

    emitRetryWindowExhausted("target-42");

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryRetryWindowExhausted",
      1,
      "Count",
    );
  });

  it("emitAdmissionDenied emits correct metric with reason", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitAdmissionDenied } = mod;

    emitAdmissionDenied("target-42", "rate_limited");

    expect(mockMetrics.setProperty).toHaveBeenCalledWith(
      "targetId",
      "target-42",
    );
    expect(mockMetrics.setProperty).toHaveBeenCalledWith(
      "reason",
      "rate_limited",
    );
    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "AdmissionDenied",
      1,
      "Count",
    );
  });

  it("emitDeliveryDuration emits correct metric", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitDeliveryDuration } = mod;

    emitDeliveryDuration("target-42", 250);

    expect(mockMetrics.putMetric).toHaveBeenCalledWith(
      "DeliveryDurationMs",
      250,
      "Milliseconds",
    );
  });

  it("flushMetrics calls flush on the instance", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitDeliveryAttempt, flushMetrics } = mod;

    emitDeliveryAttempt("t-1");
    await flushMetrics();

    expect(mockMetrics.flush).toHaveBeenCalled();
  });

  it("flushMetrics does nothing when no metrics instance exists", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const { flushMetrics } = await import("services/delivery-metrics");

    await flushMetrics();

    expect(mockMetrics.flush).not.toHaveBeenCalled();
  });

  it("resetMetrics clears the cached instance", async () => {
    // @ts-expect-error -- modulePaths resolves at runtime
    const mod = await import("services/delivery-metrics");
    const { emitDeliveryAttempt, resetMetrics } = mod;

    emitDeliveryAttempt("t-1");
    resetMetrics();
    emitDeliveryAttempt("t-2");

    expect(mockCreateMetricsLogger).toHaveBeenCalledTimes(2);
  });
});
