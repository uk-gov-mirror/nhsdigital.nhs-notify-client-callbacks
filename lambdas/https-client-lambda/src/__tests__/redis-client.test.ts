import { getRedisClient, resetRedisClient } from "services/redis-client";

jest.mock("@nhs-notify-client-callbacks/logger");

const mockPresign = jest.fn().mockResolvedValue({
  hostname: "cache.example.invalid",
  path: "/",
  query: { "X-Amz-Signature": "mock-sig" },
});

jest.mock("@smithy/signature-v4", () => ({
  SignatureV4: jest.fn().mockImplementation(() => ({ presign: mockPresign })),
}));

jest.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: jest.fn(),
}));

const mockSendCommand = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

jest.mock("@redis/client", () => ({
  createClient: jest.fn(() => ({
    sendCommand: mockSendCommand,
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    isOpen: true,
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetRedisClient();
  delete process.env.ELASTICACHE_ENDPOINT;
  delete process.env.ELASTICACHE_CACHE_NAME;
  delete process.env.ELASTICACHE_IAM_USERNAME;
});

describe("getRedisClient", () => {
  it("throws when ELASTICACHE_ENDPOINT is not set", async () => {
    await expect(getRedisClient()).rejects.toThrow(
      "ELASTICACHE_ENDPOINT is required",
    );
  });

  it("throws when ELASTICACHE_IAM_USERNAME is not set", async () => {
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";

    await expect(getRedisClient()).rejects.toThrow(
      "ELASTICACHE_IAM_USERNAME is required",
    );
  });

  it("throws when ELASTICACHE_CACHE_NAME is not set", async () => {
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";
    process.env.ELASTICACHE_IAM_USERNAME = "iam-user";

    await expect(getRedisClient()).rejects.toThrow(
      "ELASTICACHE_CACHE_NAME, ELASTICACHE_ENDPOINT, and ELASTICACHE_IAM_USERNAME are required",
    );
  });

  it("creates and connects a Redis client with IAM token", async () => {
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";
    process.env.ELASTICACHE_CACHE_NAME = "my-cache";
    process.env.ELASTICACHE_IAM_USERNAME = "iam-user";

    const client = await getRedisClient();

    expect(client).toBeDefined();
    expect(mockPresign).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
  });

  it("returns cached client when already open and token is valid", async () => {
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";
    process.env.ELASTICACHE_CACHE_NAME = "my-cache";
    process.env.ELASTICACHE_IAM_USERNAME = "iam-user";

    const first = await getRedisClient();
    const second = await getRedisClient();

    expect(first).toBe(second);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockPresign).toHaveBeenCalledTimes(1);
  });

  it("registers error handler on client", async () => {
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";
    process.env.ELASTICACHE_CACHE_NAME = "my-cache";
    process.env.ELASTICACHE_IAM_USERNAME = "iam-user";

    await getRedisClient();

    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));

    const errorHandler = mockOn.mock.calls.find(
      (c: unknown[]) => c[0] === "error",
    )![1] as (err: Error) => void;
    errorHandler(new Error("test error"));
  });

  it("disconnects existing client when token expires before reconnecting", async () => {
    jest.useFakeTimers();
    process.env.ELASTICACHE_ENDPOINT = "cache.example.invalid";
    process.env.ELASTICACHE_CACHE_NAME = "my-cache";
    process.env.ELASTICACHE_IAM_USERNAME = "iam-user";

    await getRedisClient();

    jest.advanceTimersByTime(841_000);

    await getRedisClient();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
