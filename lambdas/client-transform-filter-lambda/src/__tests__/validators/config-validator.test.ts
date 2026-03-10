import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import {
  ConfigValidationError,
  validateClientConfig,
} from "services/validators/config-validator";

const createValidConfig = (): ClientSubscriptionConfiguration => [
  {
    SubscriptionId: "00000000-0000-0000-0000-000000000001",
    ClientId: "client-1",
    Targets: [
      {
        Type: "API",
        TargetId: "target",
        InvocationEndpoint: "https://example.com",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "secret",
        },
      },
    ],
    SubscriptionType: "MessageStatus",
    MessageStatuses: ["DELIVERED"],
  },
  {
    SubscriptionId: "00000000-0000-0000-0000-000000000002",
    ClientId: "client-1",
    Targets: [
      {
        Type: "API",
        TargetId: "target",
        InvocationEndpoint: "https://example.com",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "secret",
        },
      },
    ],
    SubscriptionType: "ChannelStatus",
    ChannelType: "EMAIL",
    ChannelStatuses: ["DELIVERED"],
    SupplierStatuses: ["read"],
  },
];

describe("validateClientConfig", () => {
  it("returns the config when valid", () => {
    const config = createValidConfig();

    expect(validateClientConfig(config)).toEqual(config);
  });

  it("throws when config is not an array", () => {
    expect(() => validateClientConfig({})).toThrow(ConfigValidationError);
  });

  it("throws when invocation endpoint is not https", () => {
    const config = createValidConfig();
    config[0].Targets[0].InvocationEndpoint = "http://example.com";

    expect(() => validateClientConfig(config)).toThrow(ConfigValidationError);
  });

  it("throws when subscription IDs are not unique", () => {
    const config = createValidConfig();
    config[1].SubscriptionId = config[0].SubscriptionId;

    expect(() => validateClientConfig(config)).toThrow(ConfigValidationError);
  });

  it("throws when InvocationEndpoint is not a valid URL", () => {
    const config = createValidConfig();
    config[0].Targets[0].InvocationEndpoint = "not-a-url";

    expect(() => validateClientConfig(config)).toThrow(ConfigValidationError);
  });
});
