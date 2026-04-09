import type { RedisClientType } from "redis";
import { EndpointGate } from "src/endpoint-gate";

function createMockRedis(): jest.Mocked<Pick<RedisClientType, "eval">> &
  RedisClientType {
  return {
    eval: jest.fn(),
  } as unknown as jest.Mocked<Pick<RedisClientType, "eval">> & RedisClientType;
}

describe("EndpointGate", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let gate: EndpointGate;

  beforeEach(() => {
    redis = createMockRedis();
    gate = new EndpointGate(redis, "test-endpoint", {
      capacity: 10,
      refillPerSec: 5,
      cooldownMs: 5000,
      decayPeriodMs: 60_000,
      cbWindowPeriodMs: 30_000,
      cbErrorThreshold: 0.5,
      cbMinAttempts: 4,
      cbProbeIntervalMs: 10_000,
    });
  });

  describe("admit", () => {
    it("returns allowed when token is available", async () => {
      redis.eval.mockResolvedValueOnce([1, "allowed", 0, 5]);

      const result = await gate.admit();

      expect(result).toEqual({ allowed: true, effectiveRate: 5, probe: false });
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ["cb:{test-endpoint}", "rl:{test-endpoint}"],
          arguments: expect.arrayContaining([
            "10",
            "5",
            "5000",
            "60000",
            "30000",
            "10000",
          ]) as unknown,
        }),
      );
    });

    it("returns rate_limited when tokens exhausted", async () => {
      redis.eval.mockResolvedValueOnce([0, "rate_limited", 1000, 5]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 1000,
        effectiveRate: 5,
      });
    });

    it("returns circuit_open when circuit breaker is open", async () => {
      redis.eval.mockResolvedValueOnce([0, "circuit_open", 25_000, 0]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "circuit_open",
        retryAfterMs: 25_000,
        effectiveRate: 0,
      });
    });

    it("allows probe request when circuit is open and interval elapsed", async () => {
      redis.eval.mockResolvedValueOnce([1, "probe", 0, 0]);

      const result = await gate.admit();

      expect(result).toEqual({ allowed: true, effectiveRate: 0, probe: true });
    });

    it("handles missing retryAfterMs", async () => {
      redis.eval.mockResolvedValueOnce([0, "rate_limited", undefined, 5]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 0,
        effectiveRate: 5,
      });
    });

    it("returns reduced effectiveRate during ramp-up", async () => {
      redis.eval.mockResolvedValueOnce([1, "allowed", 0, 2]);

      const result = await gate.admit();

      expect(result).toEqual({ allowed: true, effectiveRate: 2, probe: false });
    });

    it("defaults effectiveRate to 0 when missing from allowed response", async () => {
      redis.eval.mockResolvedValueOnce([1, "allowed", 0, undefined]);

      const result = await gate.admit();

      expect(result).toEqual({ allowed: true, effectiveRate: 0, probe: false });
    });

    it("defaults effectiveRate to 0 when missing from denied response", async () => {
      redis.eval.mockResolvedValueOnce([0, "rate_limited", 1000, undefined]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 1000,
        effectiveRate: 0,
      });
    });

    it("uses default config when no overrides provided", async () => {
      const defaultGate = new EndpointGate(redis, "default-endpoint");
      redis.eval.mockResolvedValueOnce([1, "allowed", 0, 20]);

      await defaultGate.admit();

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ["cb:{default-endpoint}", "rl:{default-endpoint}"],
          arguments: expect.arrayContaining([
            "100",
            "20",
            "30000",
            "300000",
            "60000",
            "60000",
          ]) as unknown,
        }),
      );
    });
  });

  describe("recordResult", () => {
    it("returns closed state on success", async () => {
      redis.eval.mockResolvedValueOnce([1, "closed"]);

      const result = await gate.recordResult("success");

      expect(result).toEqual({ ok: true, state: "closed" });
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ["cb:{test-endpoint}"],
          arguments: expect.arrayContaining([
            "1",
            "5000",
            "60000",
            "0.5",
            "4",
          ]) as unknown,
        }),
      );
    });

    it("returns failed state on failure below threshold", async () => {
      redis.eval.mockResolvedValueOnce([0, "failed"]);

      const result = await gate.recordResult("failure");

      expect(result).toEqual({ ok: false, state: "failed" });
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          arguments: expect.arrayContaining(["0"]) as unknown,
        }),
      );
    });

    it("returns opened state when failure threshold reached", async () => {
      redis.eval.mockResolvedValueOnce([0, "opened"]);

      const result = await gate.recordResult("failure");

      expect(result).toEqual({ ok: false, state: "opened" });
    });
  });
});
