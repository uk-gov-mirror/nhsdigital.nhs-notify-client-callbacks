import {
  type ClientSubscriptionConfiguration,
  parseClientSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import { prettifyError } from "zod";

export const validateClientConfig = (
  rawConfig: unknown,
): ClientSubscriptionConfiguration => {
  const result = parseClientSubscriptionConfiguration(rawConfig);

  if (!result.success) {
    const messages = prettifyError(result.error);

    throw new Error(`Config validation failed:\n${messages}`);
  }

  return result.data;
};

export default validateClientConfig;
