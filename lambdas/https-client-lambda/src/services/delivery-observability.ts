import { logger } from "services/logger";
import {
  emitCircuitBreakerOpen,
  emitDeliveryAttempt,
  emitDeliveryFailure,
  emitDeliveryPermanentFailure,
  emitDeliverySuccess,
  emitRateLimited,
} from "services/delivery-metrics";

export function recordDeliveryAttempt(
  clientId: string,
  targetId: string,
): void {
  emitDeliveryAttempt(targetId);
  logger.info("Attempting delivery", { clientId, targetId });
}

export function recordDeliverySuccess(
  clientId: string,
  targetId: string,
): void {
  emitDeliverySuccess(targetId);
  logger.info("Delivery succeeded", { clientId, targetId });
}

export function recordDeliveryPermanentFailure(
  clientId: string,
  targetId: string,
): void {
  emitDeliveryPermanentFailure(targetId);
  logger.warn("Permanent delivery failure — sending to DLQ", {
    clientId,
    targetId,
  });
}

export function recordDeliveryRateLimited(
  clientId: string,
  targetId: string,
): void {
  emitRateLimited(targetId);
  logger.info("Rate limited (429)", { clientId, targetId });
}

export function recordDeliveryFailure(
  clientId: string,
  targetId: string,
  statusCode: number,
  backoffSec: number,
): void {
  emitDeliveryFailure(targetId);
  logger.warn("Transient delivery failure — requeuing", {
    clientId,
    targetId,
    statusCode,
    backoffSec,
  });
}

export function recordCircuitBreakerOpen(targetId: string): void {
  emitCircuitBreakerOpen(targetId);
}
