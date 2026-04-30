import type { ClientSubscriptionConfiguration } from "../client-config";
import { parseClientSubscriptionConfiguration } from "../client-config-schema";

const TARGET_ID = "00000000-0000-4000-8000-000000000001";

type ClientConfigParseResult = ReturnType<
  typeof parseClientSubscriptionConfiguration
>;

const expectFailedParse = (
  result: ClientConfigParseResult,
): Exclude<ClientConfigParseResult, { success: true }> => {
  expect(result.success).toBe(false);

  if (result.success) {
    throw new Error("Expected parseClientSubscriptionConfiguration to fail");
  }

  return result;
};

const VALID_SPKI_HASH = "KL/yFsVH+gnkkzdQ+DSlV8xMQOMehksgT6aOqQviOu8=";

const createValidConfig = (): ClientSubscriptionConfiguration => ({
  clientId: "client-1",
  subscriptions: [
    {
      subscriptionId: "00000000-0000-0000-0000-000000000001",
      subscriptionType: "MessageStatus",
      messageStatuses: ["DELIVERED"],
      targetIds: [TARGET_ID],
    },
    {
      subscriptionId: "00000000-0000-0000-0000-000000000002",
      subscriptionType: "ChannelStatus",
      channelType: "EMAIL",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["read"],
      targetIds: [TARGET_ID],
    },
  ],
  targets: [
    {
      targetId: TARGET_ID,
      type: "API",
      invocationEndpoint: "https://example.com",
      invocationMethod: "POST",
      invocationRateLimit: 10,
      apiKey: { headerName: "x-api-key", headerValue: "secret" },
      delivery: {
        mtls: {
          enabled: true,
          certPinning: { enabled: true, spkiHash: VALID_SPKI_HASH },
        },
      },
    },
  ],
});

describe("parseClientSubscriptionConfiguration", () => {
  it("returns a successful parse result when valid", () => {
    const config = createValidConfig();

    expect(parseClientSubscriptionConfiguration(config)).toEqual({
      success: true,
      data: config,
    });
  });

  it("returns a failed parse result when config is not an object", () => {
    const result = parseClientSubscriptionConfiguration([]);

    expect(result.success).toBe(false);
  });

  it("returns a failed parse result when invocation endpoint is not https", () => {
    const config = createValidConfig();
    config.targets[0].invocationEndpoint = "http://example.com";

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Expected HTTPS URL",
        path: ["targets", 0, "invocationEndpoint"],
      }),
    ]);
  });

  it("returns a failed parse result when subscription IDs are not unique", () => {
    const config = createValidConfig();
    config.subscriptions[1].subscriptionId =
      config.subscriptions[0].subscriptionId;

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Expected subscriptionId to be unique",
        path: ["subscriptions", 1, "subscriptionId"],
      }),
    ]);
  });

  it("returns a failed parse result when invocationEndpoint is not a valid URL", () => {
    const config = createValidConfig();
    config.targets[0].invocationEndpoint = "not-a-url";

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Expected HTTPS URL",
        path: ["targets", 0, "invocationEndpoint"],
      }),
    ]);
  });

  it("returns a failed parse result when target IDs are not unique", () => {
    const config = createValidConfig();
    config.targets.push({
      ...config.targets[0],
    });

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: "Expected targetId to be unique",
        path: ["targets", 1, "targetId"],
      }),
    ]);
  });

  it("returns a failed parse result when a subscription references an unknown targetId", () => {
    const config = createValidConfig();
    config.subscriptions[0].targetIds = ["unknown-target-id"];

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual([
      expect.objectContaining({
        message: 'targetId "unknown-target-id" not found in targets',
        path: ["subscriptions", 0, "targetIds", 0],
      }),
    ]);
  });

  it("parses a valid config with mtls, certPinning, and delivery fields", () => {
    const config = createValidConfig();
    config.targets[0].delivery = {
      ...config.targets[0].delivery,
      maxRetryDurationSeconds: 7200,
      circuitBreaker: { enabled: true },
    };

    expect(parseClientSubscriptionConfiguration(config)).toEqual({
      success: true,
      data: config,
    });
  });

  it("returns a failed parse result when delivery.mtls has invalid shape", () => {
    const config = createValidConfig();
    (config.targets[0] as Record<string, unknown>).delivery = {
      mtls: { enabled: "not-a-boolean" },
    };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining(["targets", 0, "delivery"]),
        }),
      ]),
    );
  });

  it("returns a failed parse result when spkiHash has an invalid pattern", () => {
    const config = createValidConfig();
    config.targets[0].delivery!.mtls!.certPinning = {
      enabled: true,
      spkiHash: "not-a-valid-hash",
    };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Invalid SPKI hash",
        }),
      ]),
    );
  });

  it("returns a failed parse result when certPinning.enabled is true without spkiHash", () => {
    const config = createValidConfig();
    config.targets[0].delivery!.mtls!.certPinning = { enabled: true };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "spkiHash is required when certPinning is enabled",
        }),
      ]),
    );
  });

  it("returns a failed parse result when maxRetryDurationSeconds is zero", () => {
    const config = createValidConfig();
    config.targets[0].delivery = { maxRetryDurationSeconds: 0 };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.success).toBe(false);
  });

  it("returns a failed parse result when maxRetryDurationSeconds is negative", () => {
    const config = createValidConfig();
    config.targets[0].delivery = { maxRetryDurationSeconds: -1 };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.success).toBe(false);
  });

  it("returns a failed parse result when maxRetryDurationSeconds is above 43200", () => {
    const config = createValidConfig();
    config.targets[0].delivery = { maxRetryDurationSeconds: 43_201 };

    const result = expectFailedParse(
      parseClientSubscriptionConfiguration(config),
    );

    expect(result.success).toBe(false);
  });

  it("accepts maxRetryDurationSeconds at boundary value 1", () => {
    const config = createValidConfig();
    config.targets[0].delivery = { maxRetryDurationSeconds: 1 };

    expect(parseClientSubscriptionConfiguration(config).success).toBe(true);
  });

  it("accepts maxRetryDurationSeconds at boundary value 43200", () => {
    const config = createValidConfig();
    config.targets[0].delivery = { maxRetryDurationSeconds: 43_200 };

    expect(parseClientSubscriptionConfiguration(config).success).toBe(true);
  });
});
