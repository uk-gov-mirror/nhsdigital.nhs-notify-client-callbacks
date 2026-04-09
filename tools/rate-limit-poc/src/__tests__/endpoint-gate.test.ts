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
      failureThreshold: 3,
      cooldownMs: 5000,
    });
  });

  describe("admit", () => {
    it("returns allowed when token is available", async () => {
      redis.eval.mockResolvedValueOnce([1, "allowed", 0]);

      const result = await gate.admit();

      expect(result).toEqual({ allowed: true });
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ["cb:{test-endpoint}", "rl:{test-endpoint}"],
          arguments: expect.arrayContaining([
            "10",
            "5",
            "3",
            "5000",
          ]) as unknown,
        }),
      );
    });

    it("returns rate_limited when tokens exhausted", async () => {
      redis.eval.mockResolvedValueOnce([0, "rate_limited", 1000]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 1000,
      });
    });

    it("returns circuit_open when circuit breaker is open", async () => {
      redis.eval.mockResolvedValueOnce([0, "circuit_open", 25_000]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "circuit_open",
        retryAfterMs: 25_000,
      });
    });

    it("handles missing retryAfterMs", async () => {
      redis.eval.mockResolvedValueOnce([0, "rate_limited", undefined]);

      const result = await gate.admit();

      expect(result).toEqual({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 0,
      });
    });

    it("uses default config when no overrides provided", async () => {
      const defaultGate = new EndpointGate(redis, "default-endpoint");
      redis.eval.mockResolvedValueOnce([1, "allowed", 0]);

      await defaultGate.admit();

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          keys: ["cb:{default-endpoint}", "rl:{default-endpoint}"],
          arguments: expect.arrayContaining([
            "100",
            "20",
            "5",
            "30000",
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
          arguments: expect.arrayContaining(["1", "3", "5000"]) as unknown,
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
