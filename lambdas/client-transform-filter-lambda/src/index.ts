import type { SQSRecord } from "aws-lambda";
import { Logger } from "services/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { type TransformedEvent, processEvents } from "handler";

export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const logger = new Logger();
  const observability = new ObservabilityService(
    logger,
    metrics,
    metricsLogger,
  );

  return processEvents(event, observability);
};

export { type TransformedEvent } from "handler";
