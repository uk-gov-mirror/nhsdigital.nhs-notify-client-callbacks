import type { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";
import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { logger } from "@nhs-notify-client-callbacks/logger";
import { wrapUnknownError } from "services/error-handler";
import { ConfigValidationError } from "services/validators/config-validator";

export class ConfigLoader {
  constructor(private readonly cache: ConfigSubscriptionCache) {}

  async loadClientConfig(
    clientId: string,
  ): Promise<ClientSubscriptionConfiguration | undefined> {
    try {
      return await this.cache.loadClientConfig(clientId);
    } catch (error) {
      const { message } = wrapUnknownError(error);
      logger.error("Failed to load config", { clientId });
      throw new ConfigValidationError([{ path: "config", message }]);
    }
  }
}
