import { Unit, createMetricsLogger } from "aws-embedded-metrics";
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
  metrics.putMetric("DeliveryAttempt", 1, Unit.Count);
}

export function emitDeliverySuccess(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliverySuccess", 1, Unit.Count);
}

export function emitDeliveryFailure(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliveryFailure", 1, Unit.Count);
}

export function emitDeliveryPermanentFailure(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliveryPermanentFailure", 1, Unit.Count);
}

export function emitRateLimited(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("DeliveryRateLimited", 1, Unit.Count);
}

export function emitCircuitBreakerOpen(targetId: string): void {
  const metrics = getMetrics();
  metrics.setProperty("targetId", targetId);
  metrics.putMetric("CircuitBreakerOpen", 1, Unit.Count);
}

export async function flushMetrics(): Promise<void> {
  if (metricsInstance) {
    await metricsInstance.flush();
  }
}

export function resetMetrics(): void {
  metricsInstance = undefined;
}
