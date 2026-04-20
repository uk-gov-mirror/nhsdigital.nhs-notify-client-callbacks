import {
  type EndpointGateConfig,
  admit,
  getRedisClient,
  recordResult,
  resetAdmitSha,
  resetRedisClient,
} from "services/endpoint-gate";

jest.mock("@nhs-notify-client-callbacks/logger");

const mockSendCommand = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

jest.mock("@redis/client", () => ({
  createClient: jest.fn(() => ({
    sendCommand: mockSendCommand,
    connect: mockConnect,
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
  on: mockOn,
  isOpen: true,
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  resetAdmitSha();
});

describe("admit", () => {
  it("returns allowed when tokens available", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ allowed: true, probe: false, effectiveRate: 10 }),
    );

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({ allowed: true, probe: false, effectiveRate: 10 });
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["EVALSHA"]),
    );
  });

  it("returns rate_limited when tokens exhausted", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 500,
        effectiveRate: 10,
      }),
    );

    const result = await admit(mockRedis, "target-1", 10, false, defaultConfig);

    expect(result).toEqual({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 500,
      effectiveRate: 10,
    });
  });

  it("returns circuit_open with probe slot available", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ allowed: true, probe: true, effectiveRate: 0 }),
    );

    const result = await admit(mockRedis, "target-1", 10, true, defaultConfig);

    expect(result).toEqual({ allowed: true, probe: true, effectiveRate: 0 });
  });

  it("returns circuit_open without probe slot", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({
        allowed: false,
        reason: "circuit_open",
        retryAfterMs: 30_000,
        effectiveRate: 0,
      }),
    );

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
      .mockResolvedValueOnce(
        JSON.stringify({ allowed: true, probe: false, effectiveRate: 10 }),
      );

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

  it("passes cbEnabled=0 when circuit breaker is disabled", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ allowed: true, probe: false, effectiveRate: 10 }),
    );

    await admit(mockRedis, "target-1", 10, false, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    const cbEnabledArg = args[9];
    expect(cbEnabledArg).toBe("0");
  });

  it("passes correct keys for target-specific hashes", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ allowed: true, probe: false, effectiveRate: 5 }),
    );

    await admit(mockRedis, "my-target", 5, true, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("rl:my-target");
    expect(args[4]).toBe("cb:my-target");
  });
});

describe("recordResult", () => {
  it("returns closed on success below threshold", async () => {
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ ok: true, state: "closed" }),
    );

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
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ ok: false, state: "opened" }),
    );

    const result = await recordResult(
      mockRedis,
      "target-1",
      false,
      defaultConfig,
    );

    expect(result).toEqual({ ok: false, state: "opened" });
  });

  it("falls back to EVAL on NOSCRIPT error", async () => {
    mockSendCommand
      .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
      .mockResolvedValueOnce(JSON.stringify({ ok: true, state: "closed" }));

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
    mockSendCommand.mockResolvedValueOnce(
      JSON.stringify({ ok: true, state: "closed" }),
    );

    await recordResult(mockRedis, "my-target", true, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("cb:my-target");
  });
});

describe("getRedisClient", () => {
  beforeEach(() => {
    resetRedisClient();
    delete process.env.ELASTICACHE_ENDPOINT;
  });

  it("throws when ELASTICACHE_ENDPOINT is not set", async () => {
    await expect(getRedisClient()).rejects.toThrow(
      "ELASTICACHE_ENDPOINT is required",
    );
  });

  it("creates and connects a Redis client", async () => {
    process.env.ELASTICACHE_ENDPOINT = "localhost";

    const client = await getRedisClient();

    expect(client).toBeDefined();
    expect(mockConnect).toHaveBeenCalled();
  });

  it("returns cached client when already open", async () => {
    process.env.ELASTICACHE_ENDPOINT = "localhost";

    const first = await getRedisClient();
    const second = await getRedisClient();

    expect(first).toBe(second);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("registers error handler on client", async () => {
    process.env.ELASTICACHE_ENDPOINT = "localhost";

    await getRedisClient();

    expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));

    const errorHandler = mockOn.mock.calls.find(
      (c: unknown[]) => c[0] === "error",
    )![1] as (err: Error) => void;
    errorHandler(new Error("test error"));
  });
});
