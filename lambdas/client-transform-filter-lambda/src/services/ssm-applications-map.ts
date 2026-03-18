import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { logger } from "services/logger";

const DEFAULT_CACHE_TTL_MS = 60_000;

export class ApplicationsMapService {
  private cachedMap: Map<string, string> | undefined;

  private cacheExpiresAt = 0;

  constructor(
    private readonly ssmClient: SSMClient,
    private readonly parameterName: string,
    private readonly cacheTtlMs: number = DEFAULT_CACHE_TTL_MS,
  ) {}

  async getApplicationId(clientId: string): Promise<string | undefined> {
    const map = await this.getMap();
    return map.get(clientId);
  }

  private async getMap(): Promise<Map<string, string>> {
    if (this.cachedMap && Date.now() < this.cacheExpiresAt) {
      logger.debug("Applications map loaded from cache");
      return this.cachedMap;
    }

    const response = await this.ssmClient.send(
      new GetParameterCommand({
        Name: this.parameterName,
        WithDecryption: true,
      }),
    );

    if (!response.Parameter?.Value) {
      throw new Error(
        `SSM parameter '${this.parameterName}' not found or has no value`,
      );
    }

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(response.Parameter.Value) as Record<string, string>;
    } catch {
      throw new Error(
        `SSM parameter '${this.parameterName}' contains invalid JSON`,
      );
    }
    this.cachedMap = new Map(Object.entries(parsed));
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    logger.info("Applications map loaded from SSM", {
      parameterName: this.parameterName,
    });
    return this.cachedMap;
  }

  reset(): void {
    this.cachedMap = undefined;
    this.cacheExpiresAt = 0;
  }
}
