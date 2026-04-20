import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { ConfigSubscriptionCache } from "config-subscription-cache";

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

const VALID_CONFIG = {
  clientId: "client-1",
  subscriptions: [],
  targets: [
    {
      targetId: "target-1",
      type: "API",
      invocationEndpoint: "https://webhook.example.invalid",
      invocationMethod: "POST",
      invocationRateLimit: 10,
      apiKey: { headerName: "x-api-key", headerValue: "secret" },
    },
  ],
};

const makeS3Response = (body: unknown) => ({
  Body: {
    transformToString: jest.fn().mockResolvedValue(JSON.stringify(body)),
  },
});

const createCache = (ttlMs = 1000) => {
  const { S3Client } = jest.requireMock("@aws-sdk/client-s3");
  return new ConfigSubscriptionCache({
    s3Client: new S3Client(),
    bucketName: "test-bucket",
    keyPrefix: "client_subscriptions/",
    ttlMs,
  });
};

describe("ConfigSubscriptionCache", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
  });

  it("loads and parses valid config from S3", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));
    const cache = createCache();

    const result = await cache.loadClientConfig("client-1");

    expect(result).toEqual(VALID_CONFIG);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("uses the configured key prefix for S3 requests", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));
    const cache = createCache();

    await cache.loadClientConfig("client-1");

    const command: GetObjectCommand = mockS3Send.mock.calls[0][0];
    expect(command.input.Key).toBe("client_subscriptions/client-1.json");
    expect(command.input.Bucket).toBe("test-bucket");
  });

  it("returns cached config on subsequent calls", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));
    const cache = createCache();

    await cache.loadClientConfig("client-1");
    await cache.loadClientConfig("client-1");

    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("re-fetches from S3 after TTL expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));
    const cache = createCache(1000);

    await cache.loadClientConfig("client-1");

    jest.advanceTimersByTime(1001);

    await cache.loadClientConfig("client-1");

    expect(mockS3Send).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it("returns undefined when S3 key does not exist", async () => {
    mockS3Send.mockRejectedValue(new NoSuchKey({ $metadata: {}, message: "" }));
    const cache = createCache();

    const result = await cache.loadClientConfig("missing-client");

    expect(result).toBeUndefined();
  });

  it("throws when config fails validation", async () => {
    const invalidConfig = { ...VALID_CONFIG, targets: [{ invalid: true }] };
    mockS3Send.mockResolvedValue(makeS3Response(invalidConfig));
    const cache = createCache();

    await expect(cache.loadClientConfig("client-1")).rejects.toThrow(
      "Invalid client config for 'client-1'",
    );
  });

  it("throws when S3 body is empty", async () => {
    mockS3Send.mockResolvedValue({ Body: undefined });
    const cache = createCache();

    await expect(cache.loadClientConfig("client-1")).rejects.toThrow(
      "S3 response body was empty for client 'client-1'",
    );
  });

  it("propagates non-NoSuchKey S3 errors", async () => {
    mockS3Send.mockRejectedValue(new Error("S3 access denied"));
    const cache = createCache();

    await expect(cache.loadClientConfig("client-1")).rejects.toThrow(
      "S3 access denied",
    );
  });

  it("clears cache on reset", async () => {
    mockS3Send.mockResolvedValue(makeS3Response(VALID_CONFIG));
    const cache = createCache();

    await cache.loadClientConfig("client-1");
    cache.reset();
    await cache.loadClientConfig("client-1");

    expect(mockS3Send).toHaveBeenCalledTimes(2);
  });
});
