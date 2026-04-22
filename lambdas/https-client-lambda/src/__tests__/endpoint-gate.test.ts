import {
  type EndpointGateConfig,
  admit,
  recordResult,
  resetAdmitSha,
} from "services/endpoint-gate";

const mockSendCommand = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

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
    expect(args[3]).toBe("cb:{my-target}");
    expect(args[4]).toBe("rl:{my-target}");
  });
});

describe("evalScript", () => {
  it("throws a wrapped error including the original message when EVALSHA fails with a non-NOSCRIPT Error", async () => {
    const redisError = new Error("WRONGTYPE Operation against a key");
    mockSendCommand.mockRejectedValueOnce(redisError);

    const thrown = await admit(
      mockRedis,
      "target-1",
      10,
      true,
      defaultConfig,
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Redis error in script");
    expect((thrown as Error).message).toContain(
      "WRONGTYPE Operation against a key",
    );
    expect((thrown as Error & { cause: unknown }).cause).toBe(redisError);
  });

  it("throws a wrapped error using String() when EVALSHA rejects with a non-Error value", async () => {
    mockSendCommand.mockRejectedValueOnce("connection refused");

    const thrown = await admit(
      mockRedis,
      "target-1",
      10,
      true,
      defaultConfig,
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Redis error in script");
    expect((thrown as Error).message).toContain("connection refused");
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

  it("passes correct cb key for target", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "closed"]);

    await recordResult(mockRedis, "my-target", true, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("cb:{my-target}");
  });
});
