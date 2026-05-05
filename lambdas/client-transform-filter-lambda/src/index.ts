import type { SQSRecord } from "aws-lambda";
import { Logger } from "@nhs-notify-client-callbacks/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { ConfigLoaderService } from "services/config-loader-service";
import { type TransformedEvent, processEvents } from "handler";

export const configLoaderService = new ConfigLoaderService();

export interface HandlerDependencies {
  createObservabilityService?: () => ObservabilityService;
  createConfigLoaderService?: () => ConfigLoaderService;
}

function createDefaultObservabilityService(): ObservabilityService {
  const metricsLogger = createMetricLogger();
  const metrics = new CallbackMetrics(metricsLogger);
  const logger = new Logger();

  return new ObservabilityService(logger, metrics, metricsLogger);
}

function createDefaultConfigLoaderService(): ConfigLoaderService {
  return configLoaderService;
}

export function createHandler(
  dependencies: Partial<HandlerDependencies> = {},
): (event: SQSRecord[]) => Promise<TransformedEvent[]> {
  const createObservabilityService =
    dependencies.createObservabilityService ??
    createDefaultObservabilityService;
  const configLoader = (
    dependencies.createConfigLoaderService ?? createDefaultConfigLoaderService
  )();

  return async (event: SQSRecord[]): Promise<TransformedEvent[]> => {
    const observability = createObservabilityService();
    return processEvents(event, observability, configLoader.getLoader());
  };
}

export const handler = createHandler();

export { type TransformedEvent } from "handler";
