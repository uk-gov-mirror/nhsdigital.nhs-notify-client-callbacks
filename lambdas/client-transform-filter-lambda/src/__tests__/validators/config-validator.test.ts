import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import {
  createChannelStatusSubscription,
  createClientSubscriptionConfig,
  createMessageStatusSubscription,
  createTarget,
} from "__tests__/helpers/client-subscription-fixtures";
import {
  ConfigValidationError,
  validateClientConfig,
} from "services/validators/config-validator";

const createValidConfig = (): ClientSubscriptionConfiguration =>
  createClientSubscriptionConfig("client-1", {
    subscriptions: [
      createMessageStatusSubscription(["DELIVERED"]),
      createChannelStatusSubscription(["DELIVERED"], ["read"]),
    ],
    targets: [createTarget()],
  });

describe("validateClientConfig", () => {
  it("returns the config when valid", () => {
    const config = createValidConfig();

    expect(validateClientConfig(config)).toEqual(config);
  });

  it("throws ConfigValidationError with formatted issues when schema parsing fails", () => {
    const config = createValidConfig();
    config.subscriptions[0].targetIds = ["unknown-target-id"];

    expect(() => validateClientConfig(config)).toThrow(
      new ConfigValidationError([
        {
          path: "subscriptions[0].targetIds[0]",
          message: 'targetId "unknown-target-id" not found in targets',
        },
      ]),
    );
  });

  it("preserves all schema issues on the thrown error", () => {
    const config = createValidConfig();
    config.targets[0].invocationEndpoint = "http://example.com";
    config.subscriptions[0].targetIds = ["unknown-target-id"];

    let thrownError: unknown;

    try {
      validateClientConfig(config);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(ConfigValidationError);
    expect((thrownError as ConfigValidationError).issues).toEqual([
      {
        path: "targets[0].invocationEndpoint",
        message: "Expected HTTPS URL",
      },
      {
        path: "subscriptions[0].targetIds[0]",
        message: 'targetId "unknown-target-id" not found in targets',
      },
    ]);
  });
});
