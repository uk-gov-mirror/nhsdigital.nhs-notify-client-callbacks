import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";

import { loadTargetConfig, resetCache } from "services/config-loader";

const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: unknown[]) => mockS3Send(...args),
    })),
  };
});

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET = "test-bucket";
process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = "client_subscriptions/";
process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS = "1";

const VALID_TARGET = {
  targetId: "target-1",
  type: "API" as const,
  invocationEndpoint: "https://webhook.example.invalid",
  invocationMethod: "POST" as const,
  invocationRateLimit: 10,
  apiKey: { headerName: "x-api-key", headerValue: "secret" },
};

const VALID_CONFIG = {
  clientId: "client-1",
  subscriptions: [],
  targets: [VALID_TARGET],
};

const makeS3Response = (body: unknown) => ({
  Body: {
    transformToString: jest.fn().mockResolvedValue(JSON.stringify(body)),
  },
});

describe("loadTargetConfig", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    resetCache();
  });

  it("parses valid S3 config and returns the matching target", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    const result = await loadTargetConfig("client-1", "target-1");

    expect(result).toEqual(VALID_TARGET);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("uses CLIENT_SUBSCRIPTION_CONFIG_PREFIX for the S3 key", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    await loadTargetConfig("client-1", "target-1");

    const command: GetObjectCommand = mockS3Send.mock.calls[0][0];
    expect(command.input.Key).toBe("client_subscriptions/client-1.json");
  });

  it("rejects config missing required field", async () => {
    const invalidConfig = {
      ...VALID_CONFIG,
      targets: [
        {
          type: VALID_TARGET.type,
          invocationEndpoint: VALID_TARGET.invocationEndpoint,
          invocationMethod: VALID_TARGET.invocationMethod,
          invocationRateLimit: VALID_TARGET.invocationRateLimit,
          apiKey: VALID_TARGET.apiKey,
        },
      ],
    };
    mockS3Send.mockResolvedValue(makeS3Response(invalidConfig));

    await expect(loadTargetConfig("client-1", "target-1")).rejects.toThrow(
      "Invalid client config for 'client-1'",
    );
  });

  it("returns cached value without S3 call on subsequent requests", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    await loadTargetConfig("client-1", "target-1");
    await loadTargetConfig("client-1", "target-1");

    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("re-fetches from S3 after TTL expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    await loadTargetConfig("client-1", "target-1");

    jest.advanceTimersByTime(1001);

    await loadTargetConfig("client-1", "target-1");

    expect(mockS3Send).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it("throws when CLIENT_SUBSCRIPTION_CONFIG_BUCKET is not set", async () => {
    let loadFn: typeof loadTargetConfig;
    const saved = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires synchronous require
      loadFn = require("services/config-loader").loadTargetConfig;
    });

    await expect(loadFn!("client-1", "target-1")).rejects.toThrow(
      "CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required",
    );

    process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET = saved;
  });

  it("throws when S3 response body is empty", async () => {
    mockS3Send.mockResolvedValue({ Body: undefined });

    await expect(loadTargetConfig("client-1", "target-1")).rejects.toThrow(
      "S3 response body was empty for client 'client-1'",
    );
  });

  it("throws when client config is not found", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(null));

    await expect(
      loadTargetConfig("unknown-client", "target-1"),
    ).rejects.toThrow("Invalid client config for 'unknown-client'");
  });

  it("throws when target not found in config", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    await expect(loadTargetConfig("client-1", "nonexistent")).rejects.toThrow(
      "Target 'nonexistent' not found in config for client 'client-1'",
    );
  });

  it("uses default prefix when CLIENT_SUBSCRIPTION_CONFIG_PREFIX is not set", async () => {
    const saved = process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;
    delete process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;
    resetCache();
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    await loadTargetConfig("client-1", "target-1");

    const command: GetObjectCommand = mockS3Send.mock.calls[0][0];
    expect(command.input.Key).toBe("client_subscriptions/client-1.json");

    process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = saved;
  });

  it("uses default TTL when CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS is not set", async () => {
    const saved = process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS;
    delete process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS;
    resetCache();
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));

    const result = await loadTargetConfig("client-1", "target-1");

    expect(result).toEqual(VALID_TARGET);

    process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS = saved;
  });

  it("throws when loadClientConfig resolves to undefined", async () => {
    const spy = jest
      .spyOn(ConfigSubscriptionCache.prototype, "loadClientConfig")
      .mockResolvedValueOnce(undefined);

    await expect(loadTargetConfig("client-1", "target-1")).rejects.toThrow(
      "No configuration found for client 'client-1'",
    );

    spy.mockRestore();
  });
});
