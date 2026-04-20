import {
  recordAdmissionDenied,
  recordCircuitBreakerClosed,
  recordCircuitBreakerOpen,
  recordDeliveryAttempt,
  recordDeliveryDuration,
  recordDeliveryFailure,
  recordDeliveryPermanentFailure,
  recordDeliveryRateLimited,
  recordDeliverySuccess,
  recordRetryWindowExhausted,
} from "services/delivery-observability";

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("services/delivery-metrics", () => ({
  emitAdmissionDenied: jest.fn(),
  emitCircuitBreakerClosed: jest.fn(),
  emitCircuitBreakerOpen: jest.fn(),
  emitDeliveryAttempt: jest.fn(),
  emitDeliveryDuration: jest.fn(),
  emitDeliveryFailure: jest.fn(),
  emitDeliveryPermanentFailure: jest.fn(),
  emitDeliverySuccess: jest.fn(),
  emitRateLimited: jest.fn(),
  emitRetryWindowExhausted: jest.fn(),
}));

describe("delivery-observability", () => {
  it("recordDeliveryAttempt emits metric and logs", () => {
    const { emitDeliveryAttempt } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordDeliveryAttempt("client-1", "target-1");

    expect(emitDeliveryAttempt).toHaveBeenCalledWith("target-1");
    expect(logger.info).toHaveBeenCalledWith(
      "Attempting delivery",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordDeliverySuccess emits metric and logs", () => {
    const { emitDeliverySuccess } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordDeliverySuccess("client-1", "target-1");

    expect(emitDeliverySuccess).toHaveBeenCalledWith("target-1");
    expect(logger.info).toHaveBeenCalledWith(
      "Delivery succeeded",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordDeliveryPermanentFailure emits metric and logs warning", () => {
    const { emitDeliveryPermanentFailure } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordDeliveryPermanentFailure("client-1", "target-1");

    expect(emitDeliveryPermanentFailure).toHaveBeenCalledWith("target-1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Permanent delivery failure — sending to DLQ",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordDeliveryRateLimited emits metric and logs", () => {
    const { emitRateLimited } = jest.requireMock("services/delivery-metrics");
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordDeliveryRateLimited("client-1", "target-1");

    expect(emitRateLimited).toHaveBeenCalledWith("target-1");
    expect(logger.info).toHaveBeenCalledWith(
      "Rate limited (429)",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordDeliveryFailure emits metric and logs warning with context", () => {
    const { emitDeliveryFailure } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordDeliveryFailure("client-1", "target-1", 503, 30);

    expect(emitDeliveryFailure).toHaveBeenCalledWith("target-1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Transient delivery failure — requeuing",
      expect.objectContaining({
        clientId: "client-1",
        targetId: "target-1",
        statusCode: 503,
        backoffSec: 30,
      }),
    );
  });

  it("recordCircuitBreakerOpen emits metric and logs", () => {
    const { emitCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordCircuitBreakerOpen("target-1");

    expect(emitCircuitBreakerOpen).toHaveBeenCalledWith("target-1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Circuit breaker opened",
      expect.objectContaining({ targetId: "target-1" }),
    );
  });

  it("recordCircuitBreakerClosed emits metric and logs", () => {
    const { emitCircuitBreakerClosed } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordCircuitBreakerClosed("target-1");

    expect(emitCircuitBreakerClosed).toHaveBeenCalledWith("target-1");
    expect(logger.info).toHaveBeenCalledWith(
      "Circuit breaker closed",
      expect.objectContaining({ targetId: "target-1" }),
    );
  });

  it("recordRetryWindowExhausted emits metric and logs", () => {
    const { emitRetryWindowExhausted } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordRetryWindowExhausted("client-1", "target-1");

    expect(emitRetryWindowExhausted).toHaveBeenCalledWith("target-1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Retry window exhausted — sending to DLQ",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordAdmissionDenied emits metric and logs", () => {
    const { emitAdmissionDenied } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("@nhs-notify-client-callbacks/logger");

    recordAdmissionDenied("client-1", "target-1", "rate_limited");

    expect(emitAdmissionDenied).toHaveBeenCalledWith(
      "target-1",
      "rate_limited",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Admission denied",
      expect.objectContaining({
        clientId: "client-1",
        targetId: "target-1",
        reason: "rate_limited",
      }),
    );
  });

  it("recordDeliveryDuration emits metric", () => {
    const { emitDeliveryDuration } = jest.requireMock(
      "services/delivery-metrics",
    );

    recordDeliveryDuration("target-1", 250);

    expect(emitDeliveryDuration).toHaveBeenCalledWith("target-1", 250);
  });
});
