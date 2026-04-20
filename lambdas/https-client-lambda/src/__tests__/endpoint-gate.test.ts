import {
  type EndpointGateConfig,
  admit,
  getRedisClient,
  recordResult,
  resetAdmitSha,
  resetRedisClient,
} from "services/endpoint-gate";

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

const defaultConfig: EndpointGateConfig = {
  burstCapacity: 10,
  cbProbeIntervalMs: 60_000,
  decayPeriodMs: 300_000,
  cbWindowPeriodMs: 60_000,
  cbErrorThreshold: 0.5,
  cbMinAttempts: 10,
  cbCooldownMs: 60_000,
};

const mockRedis = {
  sendCommand: mockSendCommand,
  connect: mockConnect,
  disconnect: mockDisconnect,
  on: mockOn,
  isOpen: true,
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  resetAdmitSha();
});

describe("admit", () => {
  it("returns allowed when tokens available", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "allowed", 0, 10]);

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({ allowed: true, probe: false, effectiveRate: 10 });
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["EVALSHA"]),
    );
  });

  it("returns rate_limited when tokens exhausted", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "rate_limited", 1000, 10]);

    const result = await admit(mockRedis, "target-1", 10, false, defaultConfig);

    expect(result).toEqual({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 1000,
      effectiveRate: 10,
    });
  });

  it("returns allowed with probe flag when circuit is open but probe slot is available", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "probe", 0, 0]);

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({ allowed: true, probe: true, effectiveRate: 0 });
  });

  it("returns circuit_open without probe slot", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "circuit_open", 30_000, 0]);

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({
      allowed: false,
      reason: "circuit_open",
      retryAfterMs: 30_000,
      effectiveRate: 0,
    });
  });

  it("falls back to EVAL on NOSCRIPT error", async () => {
    mockSendCommand
      .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
      .mockResolvedValueOnce([1, "allowed", 0, 10]);

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({ allowed: true, probe: false, effectiveRate: 10 });
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
    expect(mockSendCommand).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining(["EVALSHA"]),
    );
    expect(mockSendCommand).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(["EVAL"]),
    );
  });

  it("propagates non-NOSCRIPT Redis errors", async () => {
    mockSendCommand.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(
      admit(mockRedis, "target-1", 10, true, defaultConfig),
    ).rejects.toThrow("Connection refused");
  });

  it("passes cbProbeIntervalMs=0 when circuit breaker is disabled", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "allowed", 0, 10]);

    await admit(mockRedis, "target-1", 10, false, defaultConfig);

    // EVALSHA layout: [EVALSHA, sha, keyCount, cbKey, rlKey, now, capacity, refillPerSec, cooldownMs, decayPeriodMs, cbWindowPeriodMs, cbProbeIntervalMs]
    const args = mockSendCommand.mock.calls[0]![0] as string[];
    const cbProbeIntervalArg = args[11];
    expect(cbProbeIntervalArg).toBe("0");
  });

  it("passes cbKey first, rlKey second", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "allowed", 0, 5]);

    await admit(mockRedis, "my-target", 5, true, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("cb:my-target");
    expect(args[4]).toBe("rl:my-target");
  });
});

describe("recordResult", () => {
  it("returns closed on success below threshold", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "closed"]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      true,
      defaultConfig,
    );

    expect(result).toEqual({ ok: true, state: "closed" });
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["EVALSHA"]),
    );
  });

  it("returns opened when failure crosses threshold", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "opened"]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      false,
      defaultConfig,
    );

    expect(result).toEqual({ ok: false, state: "opened" });
  });

  it("returns failed when failure is below threshold", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "failed"]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      false,
      defaultConfig,
    );

    expect(result).toEqual({ ok: false, state: "failed" });
  });

  it("falls back to EVAL on NOSCRIPT error", async () => {
    mockSendCommand
      .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
      .mockResolvedValueOnce([1, "closed"]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      true,
      defaultConfig,
    );

    expect(result).toEqual({ ok: true, state: "closed" });
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });

  it("propagates non-NOSCRIPT Redis errors", async () => {
    mockSendCommand.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(
      recordResult(mockRedis, "target-1", false, defaultConfig),
    ).rejects.toThrow("Connection refused");
  });

  it("passes correct cb key for target", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "closed"]);

    await recordResult(mockRedis, "my-target", true, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("cb:my-target");
  });
});

describe("getRedisClient", () => {
  beforeEach(() => {
    resetRedisClient();
    delete process.env.ELASTICACHE_ENDPOINT;
    delete process.env.ELASTICACHE_CACHE_NAME;
    delete process.env.ELASTICACHE_IAM_USERNAME;
  });

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
