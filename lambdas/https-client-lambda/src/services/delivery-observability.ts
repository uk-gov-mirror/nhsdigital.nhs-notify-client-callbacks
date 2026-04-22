import { logger } from "@nhs-notify-client-callbacks/logger";
import {
  emitAdmissionDenied,
  emitCircuitBreakerClosed,
  emitCircuitBreakerOpen,
  emitDeliveryAttempt,
  emitDeliveryDuration,
  emitDeliveryFailure,
  emitDeliveryPermanentFailure,
  emitDeliverySuccess,
  emitRateLimited,
  emitRetryWindowExhausted,
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
  statusCode?: number,
  errorCode?: string,
): void {
  emitDeliveryPermanentFailure(targetId);
  logger.warn("Permanent delivery failure — sending to DLQ", {
    clientId,
    targetId,
    ...(statusCode !== undefined && { statusCode }),
    ...(errorCode !== undefined && { errorCode }),
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
  logger.warn("Circuit breaker opened", { targetId });
}

export function recordCircuitBreakerClosed(targetId: string): void {
  emitCircuitBreakerClosed(targetId);
  logger.info("Circuit breaker closed", { targetId });
}

export function recordRetryWindowExhausted(
  clientId: string,
  targetId: string,
): void {
  emitRetryWindowExhausted(targetId);
  logger.warn("Retry window exhausted — sending to DLQ", {
    clientId,
    targetId,
  });
}

export function recordAdmissionDenied(
  clientId: string,
  targetId: string,
  reason: string,
): void {
  emitAdmissionDenied(targetId, reason);
  logger.warn("Admission denied", { clientId, targetId, reason });
}

export function recordDeliveryDuration(
  targetId: string,
  durationMs: number,
): void {
  emitDeliveryDuration(targetId, durationMs);
}
