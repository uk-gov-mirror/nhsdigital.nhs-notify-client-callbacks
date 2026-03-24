import { validateClientConfig } from "src/domain/client-config-validator";
import { createPopulatedClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const createValidConfig = () => createPopulatedClientSubscriptionConfig();

describe("validateClientConfig", () => {
  it("returns the config unchanged when parsing succeeds", () => {
    const config = createValidConfig();

    expect(validateClientConfig(config)).toEqual(config);
  });

  it("throws a tool-level validation error when parsing fails", () => {
    expect(() => validateClientConfig([])).toThrow(/Config validation failed/);
  });

  it("includes multiple schema issues in the thrown error message", () => {
    const config = createValidConfig();
    config.targets[0].invocationEndpoint = "http://example.com/webhook";
    config.subscriptions[0].targetIds = ["unknown-target-id"];

    expect(() => validateClientConfig(config)).toThrow(
      /Config validation failed:[\s\S]*Expected HTTPS URL[\s\S]*targetId "unknown-target-id" not found in targets/,
    );
  });
});
