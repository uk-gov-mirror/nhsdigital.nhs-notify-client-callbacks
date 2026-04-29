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
  burstCapacity: 2250,
  probeRateLimit: 1 / 60,
  recoveryPeriodMs: 600_000,
  samplePeriodMs: 300_000,
  failureThreshold: 0.3,
  minAttempts: 5,
  cooldownPeriodMs: 120_000,
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
  it("returns allowed with consumedTokens when tokens available", async () => {
    mockSendCommand.mockResolvedValueOnce([5, "some_allowed", 0, 10]);

    const result = await admit(
      mockRedis,
      "target-1",
      10,
      true,
      5,
      defaultConfig,
    );

    expect(result).toEqual({
      allowed: true,
      consumedTokens: 5,
      effectiveRate: 10,
    });
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["EVALSHA"]),
    );
  });

  it("returns rate_limited when tokens exhausted", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "rate_limited", 1000, 10]);

    const result = await admit(
      mockRedis,
      "target-1",
      10,
      false,
      5,
      defaultConfig,
    );

    expect(result).toEqual({
      allowed: false,
      reason: "rate_limited",
      retryAfterMs: 1000,
      effectiveRate: 10,
    });
  });

  it("returns circuit_open when circuit is fully open", async () => {
    mockSendCommand.mockResolvedValueOnce([0, "circuit_open", 30_000, 0]);

    const result = await admit(
      mockRedis,
      "target-1",
      10,
      true,
      5,
      defaultConfig,
    );

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
      .mockResolvedValueOnce([1, "some_allowed", 0, 10]);

    const result = await admit(
      mockRedis,
      "target-1",
      10,
      true,
      1,
      defaultConfig,
    );

    expect(result).toEqual({
      allowed: true,
      consumedTokens: 1,
      effectiveRate: 10,
    });
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

  it("passes cbEnabled=0 when circuit breaker is disabled", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "some_allowed", 0, 10]);

    await admit(mockRedis, "target-1", 10, false, 1, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    const cbEnabledArg = args[11];
    expect(cbEnabledArg).toBe("0");
  });

  it("passes single epKey", async () => {
    mockSendCommand.mockResolvedValueOnce([1, "some_allowed", 0, 5]);

    await admit(mockRedis, "my-target", 5, true, 1, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("ep:{my-target}");
  });

  it("passes targetBatchSize as ARGV", async () => {
    mockSendCommand.mockResolvedValueOnce([3, "some_allowed", 0, 10]);

    await admit(mockRedis, "target-1", 10, true, 7, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    const batchSizeArg = args[10];
    expect(batchSizeArg).toBe("7");
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
      1,
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
      1,
      defaultConfig,
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Redis error in script");
    expect((thrown as Error).message).toContain("connection refused");
  });
});

describe("recordResult", () => {
  it("returns closed state when circuit is steady-state", async () => {
    mockSendCommand.mockResolvedValueOnce(["closed", 0]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      5,
      0,
      defaultConfig,
    );

    expect(result).toEqual({ circuitState: "closed", stateChanged: false });
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["EVALSHA"]),
    );
  });

  it("returns open with stateChanged when failure crosses threshold", async () => {
    mockSendCommand.mockResolvedValueOnce(["open", 1]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      5,
      5,
      defaultConfig,
    );

    expect(result).toEqual({ circuitState: "open", stateChanged: true });
  });

  it("returns closed_recovery with stateChanged when circuit closes", async () => {
    mockSendCommand.mockResolvedValueOnce(["closed_recovery", 1]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      5,
      0,
      defaultConfig,
    );

    expect(result).toEqual({
      circuitState: "closed_recovery",
      stateChanged: true,
    });
  });

  it("returns half_open without stateChanged when probing", async () => {
    mockSendCommand.mockResolvedValueOnce(["half_open", 0]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      5,
      1,
      defaultConfig,
    );

    expect(result).toEqual({ circuitState: "half_open", stateChanged: false });
  });

  it("falls back to EVAL on NOSCRIPT error", async () => {
    mockSendCommand
      .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
      .mockResolvedValueOnce(["closed", 0]);

    const result = await recordResult(
      mockRedis,
      "target-1",
      1,
      0,
      defaultConfig,
    );

    expect(result).toEqual({ circuitState: "closed", stateChanged: false });
    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });

  it("passes correct ep key for target", async () => {
    mockSendCommand.mockResolvedValueOnce(["closed", 0]);

    await recordResult(mockRedis, "my-target", 1, 0, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[3]).toBe("ep:{my-target}");
  });

  it("passes consumedTokens and processingFailures as ARGV", async () => {
    mockSendCommand.mockResolvedValueOnce(["closed", 0]);

    await recordResult(mockRedis, "target-1", 8, 3, defaultConfig);

    const args = mockSendCommand.mock.calls[0]![0] as string[];
    expect(args[5]).toBe("8");
    expect(args[6]).toBe("3");
  });
});
