import type { SQSRecord } from "aws-lambda";
import { SSMClient } from "@aws-sdk/client-ssm";
import { Logger, flushLogs } from "services/logger";
import { CallbackMetrics, createMetricLogger } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { ConfigLoaderService } from "services/config-loader-service";
import { ApplicationsMapService } from "services/ssm-applications-map";
import { type TransformedEvent, processEvents } from "handler";

export const configLoaderService = new ConfigLoaderService();

const DEFAULT_SSM_CACHE_TTL_SECONDS = 60;

export const createSsmClient = (
  env: NodeJS.ProcessEnv = process.env,
): SSMClient => {
  const endpoint = env.AWS_ENDPOINT_URL;
  return new SSMClient({ endpoint });
};

export const applicationsMapService = new ApplicationsMapService(
  createSsmClient(),
  process.env.APPLICATIONS_MAP_PARAMETER ?? "",
  (Number.parseInt(
    process.env.APPLICATIONS_MAP_CACHE_TTL_SECONDS ??
      `${DEFAULT_SSM_CACHE_TTL_SECONDS}`,
    10,
  ) || DEFAULT_SSM_CACHE_TTL_SECONDS) * 1000,
);

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
    const result = await processEvents(
      event,
      observability,
      configLoader.getLoader(),
      applicationsMap,
    );
    await flushLogs();
    return result;
  };
}

export const handler = createHandler();

export { type TransformedEvent } from "handler";
