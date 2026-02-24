import type { SQSRecord } from "aws-lambda";
import { Logger } from "services/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { type TransformedEvent, processEvents } from "handler";

export const handler = async (
  event: SQSRecord[],
): Promise<TransformedEvent[]> => {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const rootLogger = new Logger();

  return processEvents(event, metricsLogger, metrics, rootLogger);
};

export { type TransformedEvent } from "handler";
