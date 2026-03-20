import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { logger } from "services/logger";

const DEFAULT_CACHE_TTL_SECONDS = 60;

export const createSsmClient = (
  env: NodeJS.ProcessEnv = process.env,
): SSMClient => {
  const endpoint = env.AWS_ENDPOINT_URL;
  return new SSMClient({ endpoint });
};

export const resolveCacheTtlMs = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const ttlSeconds = Number.parseInt(
    env.APPLICATIONS_MAP_CACHE_TTL_SECONDS ?? `${DEFAULT_CACHE_TTL_SECONDS}`,
    10,
  );
  return (
    (Number.isFinite(ttlSeconds) ? ttlSeconds : DEFAULT_CACHE_TTL_SECONDS) *
    1000
  );
};

export class ApplicationsMapService {
  private cachedMap: Map<string, string> | undefined;

  private cacheExpiresAt = 0;

  constructor(
    private readonly ssmClient: SSMClient = createSsmClient(),
    private readonly parameterName: string | undefined = process.env
      .APPLICATIONS_MAP_PARAMETER,
    private readonly cacheTtlMs: number = resolveCacheTtlMs(),
  ) {}

  async getApplicationId(clientId: string): Promise<string | undefined> {
    const map = await this.getMap();
    return map.get(clientId);
  }

  private async getMap(): Promise<Map<string, string>> {
    if (!this.parameterName) {
      throw new Error("APPLICATIONS_MAP_PARAMETER is required");
    }
    const { parameterName } = this;

    if (this.cachedMap && Date.now() < this.cacheExpiresAt) {
      logger.debug("Applications map loaded from cache");
      return this.cachedMap;
    }

    const response = await this.ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      }),
    );

    if (!response.Parameter?.Value) {
      throw new Error(
        `SSM parameter '${parameterName}' not found or has no value`,
      );
    }

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(response.Parameter.Value) as Record<string, string>;
    } catch {
      throw new Error(`SSM parameter '${parameterName}' contains invalid JSON`);
    }
    this.cachedMap = new Map(Object.entries(parsed));
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    logger.info("Applications map loaded from SSM", {
      parameterName,
    });
    return this.cachedMap;
  }

  reset(): void {
    this.cachedMap = undefined;
    this.cacheExpiresAt = 0;
  }
}
