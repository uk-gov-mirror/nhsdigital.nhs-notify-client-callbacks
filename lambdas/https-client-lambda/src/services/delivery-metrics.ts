import {
  StorageResolution,
  Unit,
  createMetricsLogger,
} from "aws-embedded-metrics";
import type { MetricsLogger } from "aws-embedded-metrics";

let metricsInstance: MetricsLogger | undefined;

function getMetrics(): MetricsLogger {
  if (metricsInstance) {
    return metricsInstance;
  }

  const namespace = process.env.METRICS_NAMESPACE;
  const environment = process.env.ENVIRONMENT;

  if (!namespace) {
    throw new Error("METRICS_NAMESPACE environment variable is not set");
  }
  if (!environment) {
    throw new Error("ENVIRONMENT environment variable is not set");
  }

  metricsInstance = createMetricsLogger();
  metricsInstance.setNamespace(namespace);
  metricsInstance.setDimensions({ Environment: environment });

  return metricsInstance;
}

export function emitDeliveryAttempt(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliveryAttempt", 1, Unit.Count, StorageResolution.High);
}

export function emitDeliverySuccess(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliverySuccess", 1, Unit.Count, StorageResolution.High);
}

export function emitDeliveryFailure(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliveryFailure", 1, Unit.Count, StorageResolution.High);
}

export function emitDeliveryPermanentFailure(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "DeliveryPermanentFailure",
    1,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitRateLimited(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "DeliveryRateLimited",
    1,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitCircuitBreakerOpen(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "CircuitBreakerOpen",
    1,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitCircuitBreakerClosed(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "CircuitBreakerClosed",
    1,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitRetryWindowExhausted(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "DeliveryRetryWindowExhausted",
    1,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitAdmissionDenied(
  targetId: string,
  reason: string,
  count = 1,
): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.setProperty("reason", reason);
  metrics.putMetric(
    "AdmissionDenied",
    count,
    Unit.Count,
    StorageResolution.High,
  );
}

export function emitDeliveryDuration(
  targetId: string,
  durationMs: number,
): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric(
    "DeliveryDurationMs",
    durationMs,
    Unit.Milliseconds,
    StorageResolution.High,
  );
}

export async function flushMetrics(): Promise<void> {
  if (metricsInstance) {
    await metricsInstance.flush();
  }
}

export function resetMetrics(): void {
  metricsInstance = undefined;
}
