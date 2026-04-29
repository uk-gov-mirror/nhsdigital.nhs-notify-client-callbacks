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
  correlationId?: string,
  sqsMessageId?: string,
  receiveCount?: number,
): void {
  emitDeliveryAttempt(targetId);
  logger.info("Attempting delivery", {
    clientId,
    targetId,
    correlationId,
    sqsMessageId,
    receiveCount,
  });
}

export function recordDeliverySuccess(
  clientId: string,
  targetId: string,
  correlationId?: string,
): void {
  emitDeliverySuccess(targetId);
  logger.info("Delivery succeeded", { clientId, targetId, correlationId });
}

export function recordDeliveryPermanentFailure(
  clientId: string,
  targetId: string,
  statusCode?: number,
  errorCode?: string,
  correlationId?: string,
): void {
  emitDeliveryPermanentFailure(targetId);
  logger.warn("Permanent delivery failure — sending to DLQ", {
    clientId,
    targetId,
    correlationId,
    ...(statusCode !== undefined && { statusCode }),
    ...(errorCode !== undefined && { errorCode }),
  });
}

export function recordDeliveryRateLimited(
  clientId: string,
  targetId: string,
  correlationId?: string,
): void {
  emitRateLimited(targetId);
  logger.info("Rate limited (429)", { clientId, targetId, correlationId });
}

export function recordDeliveryFailure(
  clientId: string,
  targetId: string,
  statusCode: number,
  backoffSec: number,
  receiveCount: number,
  correlationId?: string,
): void {
  emitDeliveryFailure(targetId);
  logger.warn("Transient delivery failure — requeuing", {
    clientId,
    targetId,
    correlationId,
    statusCode,
    backoffSec,
    receiveCount,
  });
}

export function recordCircuitBreakerOpen(
  targetId: string,
  correlationId?: string,
): void {
  emitCircuitBreakerOpen(targetId);
  logger.warn("Circuit breaker opened", { targetId, correlationId });
}

export function recordCircuitBreakerClosed(
  targetId: string,
  correlationId?: string,
): void {
  emitCircuitBreakerClosed(targetId);
  logger.info("Circuit breaker closed", { targetId, correlationId });
}

export function recordRetryWindowExhausted(
  clientId: string,
  targetId: string,
  correlationId?: string,
): void {
  emitRetryWindowExhausted(targetId);
  logger.warn("Retry window exhausted — sending to DLQ", {
    clientId,
    targetId,
    correlationId,
  });
}

export function recordAdmissionDenied(
  clientId: string,
  targetId: string,
  reason: string,
  correlationIds: (string | undefined)[],
): void {
  emitAdmissionDenied(targetId, reason, correlationIds.length);
  logger.warn("Admission denied", {
    clientId,
    targetId,
    reason,
    deniedCount: correlationIds.length,
    correlationIds,
  });
}

export function recordDeliveryDuration(
  targetId: string,
  durationMs: number,
): void {
  emitDeliveryDuration(targetId, durationMs);
}
