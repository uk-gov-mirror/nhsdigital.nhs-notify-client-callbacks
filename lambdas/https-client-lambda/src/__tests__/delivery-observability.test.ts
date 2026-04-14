import {
  recordCircuitBreakerOpen,
  recordDeliveryAttempt,
  recordDeliveryFailure,
  recordDeliveryPermanentFailure,
  recordDeliveryRateLimited,
  recordDeliverySuccess,
} from "services/delivery-observability";

jest.mock("services/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("services/delivery-metrics", () => ({
  emitDeliveryAttempt: jest.fn(),
  emitDeliverySuccess: jest.fn(),
  emitDeliveryFailure: jest.fn(),
  emitDeliveryPermanentFailure: jest.fn(),
  emitCircuitBreakerOpen: jest.fn(),
  emitRateLimited: jest.fn(),
}));

describe("delivery-observability", () => {
  it("recordDeliveryAttempt emits metric and logs", () => {
    const { emitDeliveryAttempt } = jest.requireMock(
      "services/delivery-metrics",
    );
    const { logger } = jest.requireMock("services/logger");

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
    const { logger } = jest.requireMock("services/logger");

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
    const { logger } = jest.requireMock("services/logger");

    recordDeliveryPermanentFailure("client-1", "target-1");

    expect(emitDeliveryPermanentFailure).toHaveBeenCalledWith("target-1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Permanent delivery failure — sending to DLQ",
      expect.objectContaining({ clientId: "client-1", targetId: "target-1" }),
    );
  });

  it("recordDeliveryRateLimited emits metric and logs", () => {
    const { emitRateLimited } = jest.requireMock("services/delivery-metrics");
    const { logger } = jest.requireMock("services/logger");

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
    const { logger } = jest.requireMock("services/logger");

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

  it("recordCircuitBreakerOpen emits metric", () => {
    const { emitCircuitBreakerOpen } = jest.requireMock(
      "services/delivery-metrics",
    );

    recordCircuitBreakerOpen("target-1");

    expect(emitCircuitBreakerOpen).toHaveBeenCalledWith("target-1");
  });
});
