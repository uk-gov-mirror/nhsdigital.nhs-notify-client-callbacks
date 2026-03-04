import type { SQSRecord } from "aws-lambda";
import { Logger } from "services/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { type TransformedEvent, processEvents } from "handler";

export interface HandlerDependencies {
  createObservabilityService: () => ObservabilityService;
}

function createDefaultObservabilityService(): ObservabilityService {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const logger = new Logger();

  return new ObservabilityService(logger, metrics, metricsLogger);
}

export function createHandler(
  dependencies: Partial<HandlerDependencies> = {},
): (event: SQSRecord[]) => Promise<TransformedEvent[]> {
  const createObservabilityService =
    dependencies.createObservabilityService ??
    createDefaultObservabilityService;

  return async (event: SQSRecord[]): Promise<TransformedEvent[]> => {
    const observability = createObservabilityService();
    return processEvents(event, observability);
  };
}

export const handler = createHandler();

export { type TransformedEvent } from "handler";
