import type { SQSRecord } from "aws-lambda";
import { Logger } from "services/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { ConfigLoaderService } from "services/config-loader-service";
import { ApplicationsMapService } from "services/ssm-applications-map";
import { type TransformedEvent, processEvents } from "handler";

export const configLoaderService = new ConfigLoaderService();

export const applicationsMapService = new ApplicationsMapService();

export interface HandlerDependencies {
  createObservabilityService?: () => ObservabilityService;
  createConfigLoaderService?: () => ConfigLoaderService;
  createApplicationsMapService?: () => ApplicationsMapService;
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

function createDefaultApplicationsMapService(): ApplicationsMapService {
  return applicationsMapService;
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
  const applicationsMap = (
    dependencies.createApplicationsMapService ??
    createDefaultApplicationsMapService
  )();

  return async (event: SQSRecord[]): Promise<TransformedEvent[]> => {
    const observability = createObservabilityService();
    return processEvents(
      event,
      observability,
      configLoader.getLoader(),
      applicationsMap,
    );
  };
}

export const handler = createHandler();

export { type TransformedEvent } from "handler";
