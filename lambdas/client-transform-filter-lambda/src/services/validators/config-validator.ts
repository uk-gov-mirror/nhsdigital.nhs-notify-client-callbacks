import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { parseClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import {
  ConfigValidationError,
  type ValidationIssue,
  formatValidationIssuePath,
} from "services/error-handler";

export { ConfigValidationError } from "services/error-handler";

export const validateClientConfig = (
  rawConfig: unknown,
): ClientSubscriptionConfiguration => {
  const result = parseClientSubscriptionConfiguration(rawConfig);

  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => {
      const pathSegments = issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      );

      return {
        path: formatValidationIssuePath(pathSegments),
        message: issue.message,
      };
    });
    throw new ConfigValidationError(issues);
  }

  return result.data;
};

export {
  type ChannelStatusSubscriptionConfiguration,
  type MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
