import admitLuaSrc from "services/admit.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

// ARGV: [now, capacity, targetRateLimit, cooldownMs, recoveryPeriodMs, probeRateLimit, targetBatchSize, cbEnabled]
// KEYS: [epKey]
// Returns: [consumedTokens, reason, retryAfterMs, effectiveRate]

type AdmitArgs = {
  now: number;
  capacity: number;
  targetRateLimit: number;
  cooldownMs: number;
  recoveryPeriodMs: number;
  probeRateLimit: number;
  targetBatchSize: number;
  cbEnabled: boolean;
};

const defaultArgs: AdmitArgs = {
  now: 1_000_000,
  capacity: 2250,
  targetRateLimit: 10,
  cooldownMs: 120_000,
  recoveryPeriodMs: 600_000,
  probeRateLimit: 1 / 60,
  targetBatchSize: 1,
  cbEnabled: true,
};

type AdmitResult = {
  consumedTokens: number;
  reason: string;
  retryAfterMs: number;
  effectiveRate: number;
};

function runAdmit(
  store: ReturnType<typeof createRedisStore>,
  args: Partial<AdmitArgs> = {},
  targetId = "t1",
): AdmitResult {
  const merged = { ...defaultArgs, ...args };
  const raw = evalLua(
    admitLuaSrc,
    [`ep:${targetId}`],
    [
      merged.now.toString(),
      merged.capacity.toString(),
      merged.targetRateLimit.toString(),
      merged.cooldownMs.toString(),
      merged.recoveryPeriodMs.toString(),
      merged.probeRateLimit.toString(),
      merged.targetBatchSize.toString(),
      merged.cbEnabled ? "1" : "0",
    ],
    store,
  ) as [number, string, number, number];
  return {
    consumedTokens: raw[0],
    reason: raw[1],
    retryAfterMs: raw[2],
    effectiveRate: raw[3],
  };
}

describe("admit.lua", () => {
  describe("rate limiting", () => {
    it("rate-limits on a fresh endpoint with no prior state", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      const { consumedTokens, effectiveRate, reason } = runAdmit(store, {
        now,
        targetRateLimit: 10,
      });

      expect(consumedTokens).toBe(0);
      expect(reason).toBe("rate_limited");
      expect(effectiveRate).toBeCloseTo(1 / 60, 5);
    });

    it("generates a probe token on the second call after enough elapsed time", () => {
      const store = createRedisStore();

      runAdmit(store, { now: 1_000_000, targetRateLimit: 10 });

      const { consumedTokens, effectiveRate, reason } = runAdmit(store, {
        now: 1_060_001,
        targetRateLimit: 10,
      });

      expect(effectiveRate).toBeCloseTo(1 / 60, 5);
      expect(consumedTokens).toBe(1);
      expect(reason).toBe("some_allowed");
    });

    it("does not persist circuit state on first contact", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      runAdmit(store, { now, targetRateLimit: 10 });

      const epHash = store.get("ep:t1")!;
      expect(epHash.has("is_open")).toBe(false);
      expect(epHash.has("switched_at")).toBe(false);
    });

    it("allows full rate after record-result closes the circuit", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["switched_at", now.toString()],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", now.toString()],
        ]),
      );

      const later = now + 60_000;
      const { consumedTokens, reason } = runAdmit(store, {
        now: later,
        targetRateLimit: 10,
        recoveryPeriodMs: 600_000,
      });

      expect(consumedTokens).toBeGreaterThanOrEqual(1);
      expect(reason).toBe("some_allowed");
    });

    it("allows a single request when bucket has tokens from refill", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", "0"],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens, reason, retryAfterMs } = runAdmit(store, {
        now,
        targetRateLimit: 10,
      });

      expect(consumedTokens).toBe(1);
      expect(reason).toBe("some_allowed");
      expect(retryAfterMs).toBe(0);
    });

    it("consumes up to targetBatchSize tokens", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "5"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now,
        targetBatchSize: 3,
      });
      expect(consumedTokens).toBe(3);
    });

    it("consumes all available when batch exceeds available tokens", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "2"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now,
        targetBatchSize: 5,
      });
      expect(consumedTokens).toBe(2);
    });

    it("returns rate_limited when no tokens available", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens, reason, retryAfterMs } = runAdmit(store, { now });
      expect(consumedTokens).toBe(0);
      expect(reason).toBe("rate_limited");
      expect(retryAfterMs).toBe(1000);
    });

    it("refills tokens over time", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now: now + 1000,
        targetRateLimit: 10,
      });
      expect(consumedTokens).toBe(1);
    });

    it("caps tokens at capacity", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", "0"],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now,
        capacity: 5,
        targetRateLimit: 100,
        targetBatchSize: 10,
      });
      expect(consumedTokens).toBe(5);
    });

    it("handles zero refill rate", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      const { consumedTokens, reason } = runAdmit(store, {
        now: now + 10_000,
        targetRateLimit: 0,
      });
      expect(consumedTokens).toBe(0);
      expect(reason).toBe("rate_limited");
    });

    it("preserves fractional refill time (bucketRefilledAt += generationTime, not now)", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", (now - 150).toString()],
          ["switched_at", "0"],
        ]),
      );

      runAdmit(store, { now, targetRateLimit: 10 });

      const epHash = store.get("ep:t1")!;
      const refilledAt = Number(epHash.get("bucket_refilled_at"));
      // 1 token generated at rate 10/s takes 100ms, so refilledAt = (now-150) + 100 = now - 50
      expect(refilledAt).toBe(now - 50);
    });
  });

  describe("circuit breaker states", () => {
    it("blocks completely when circuit is open during cooldown", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 10_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "100"],
        ]),
      );

      const { consumedTokens, reason } = runAdmit(store, {
        now,
        cooldownMs: 120_000,
      });
      expect(consumedTokens).toBe(0);
      expect(reason).toBe("circuit_open");
    });

    it("does not consume bucket tokens when fully open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 10_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "100"],
          ["bucket_refilled_at", now.toString()],
        ]),
      );

      runAdmit(store, { now, cooldownMs: 120_000 });

      const epHash = store.get("ep:t1")!;
      expect(Number(epHash.get("bucket_tokens"))).toBe(100);
    });

    it("returns retryAfterMs for open circuit", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 10_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
        ]),
      );

      const { retryAfterMs } = runAdmit(store, { now, cooldownMs: 120_000 });
      expect(retryAfterMs).toBe(110_000);
    });

    it("uses probeRateLimit when half-open (after cooldown)", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 130_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", (now - 60_000).toString()],
        ]),
      );

      const { effectiveRate } = runAdmit(store, {
        now,
        cooldownMs: 120_000,
        probeRateLimit: 1 / 60,
      });
      expect(effectiveRate).toBeCloseTo(1 / 60, 5);
    });

    it("zeroes residual bucket tokens when circuit is half-open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 130_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "100"],
          ["bucket_refilled_at", (now - 60_000).toString()],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now,
        cooldownMs: 120_000,
        probeRateLimit: 1 / 60,
      });

      expect(consumedTokens).toBe(1);
      const epHash = store.get("ep:t1")!;
      expect(Number(epHash.get("bucket_tokens"))).toBe(0);
    });

    it("uses recovery ramp when closed during recovery period", () => {
      const store = createRedisStore();
      const switchedAt = 1_000_000;
      const recoveryPeriodMs = 600_000;
      const now = switchedAt + recoveryPeriodMs / 2;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", "0"],
        ]),
      );

      const { effectiveRate } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        recoveryPeriodMs,
      });
      const probeRate = defaultArgs.probeRateLimit;
      const expectedRate = probeRate + 0.5 * (10 - probeRate);
      expect(effectiveRate).toBeCloseTo(expectedRate, 5);
    });

    it("uses full rate when closed and past recovery period", () => {
      const store = createRedisStore();
      const switchedAt = 100_000;
      const recoveryPeriodMs = 600_000;
      const now = switchedAt + recoveryPeriodMs + 1;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["switched_at", switchedAt.toString()],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", "0"],
        ]),
      );

      const { effectiveRate } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        recoveryPeriodMs,
      });
      expect(effectiveRate).toBe(10);
    });
  });

  describe("state persistence", () => {
    it("persists bucket_tokens and bucket_refilled_at", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "5"],
          ["bucket_refilled_at", now.toString()],
          ["switched_at", "0"],
        ]),
      );

      runAdmit(store, { now, targetBatchSize: 2 });

      const epHash = store.get("ep:t1")!;
      expect(Number(epHash.get("bucket_tokens"))).toBe(3);
    });

    it("does not write any fields when circuit_open early return", () => {
      const store = createRedisStore();
      runAdmit(store, {
        now: 10_000,
      });

      expect(store.has("ep:t1")).toBe(false);
    });

    it("does not write sampling or circuit fields on half-open path", () => {
      const store = createRedisStore();
      runAdmit(store, {
        now: 200_000,
      });

      const epHash = store.get("ep:t1")!;
      expect(epHash.has("bucket_tokens")).toBe(true);
      expect(epHash.has("bucket_refilled_at")).toBe(true);
      expect(epHash.has("cur_attempts")).toBe(false);
      expect(epHash.has("cur_failures")).toBe(false);
      expect(epHash.has("sample_till")).toBe(false);
      expect(epHash.has("is_open")).toBe(false);
      expect(epHash.has("switched_at")).toBe(false);
    });

    it("isolates state between targets", () => {
      const store = createRedisStore();
      store.set(
        "ep:target-a",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "5"],
          ["bucket_refilled_at", "10000"],
        ]),
      );
      store.set(
        "ep:target-b",
        new Map([
          ["is_open", "0"],
          ["bucket_tokens", "3"],
          ["bucket_refilled_at", "10000"],
        ]),
      );

      runAdmit(store, { now: 10_000 }, "target-a");
      runAdmit(store, { now: 10_000 }, "target-b");

      expect(store.has("ep:target-a")).toBe(true);
      expect(store.has("ep:target-b")).toBe(true);
    });
  });

  describe("circuit breaker disabled (cbEnabled = false)", () => {
    it("uses full targetRateLimit on a fresh endpoint with no prior state", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      const { effectiveRate } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        cbEnabled: false,
      });

      expect(effectiveRate).toBe(10);
    });

    it("applies initial values on fresh endpoint so first call has no tokens", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      const { consumedTokens, effectiveRate, reason } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        cbEnabled: false,
      });

      expect(effectiveRate).toBe(10);
      expect(consumedTokens).toBe(0);
      expect(reason).toBe("rate_limited");
    });

    it("generates tokens at full rate after initial contact", () => {
      const store = createRedisStore();

      runAdmit(store, {
        now: 1_000_000,
        targetRateLimit: 10,
        cbEnabled: false,
      });
      const { consumedTokens, reason } = runAdmit(store, {
        now: 1_000_100,
        targetRateLimit: 10,
        cbEnabled: false,
      });

      expect(consumedTokens).toBe(1);
      expect(reason).toBe("some_allowed");
    });

    it("ignores is_open state when CB is disabled", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", now.toString()],
          ["bucket_tokens", "5"],
          ["bucket_refilled_at", now.toString()],
        ]),
      );

      const { consumedTokens, effectiveRate, reason } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        cbEnabled: false,
      });

      expect(effectiveRate).toBe(10);
      expect(consumedTokens).toBe(1);
      expect(reason).toBe("some_allowed");
    });

    it("does not zero bucket tokens when is_open and CB disabled", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", now.toString()],
          ["bucket_tokens", "5"],
          ["bucket_refilled_at", now.toString()],
        ]),
      );

      const { consumedTokens } = runAdmit(store, {
        now,
        targetRateLimit: 10,
        cbEnabled: false,
        targetBatchSize: 3,
      });

      expect(consumedTokens).toBe(3);
    });

    it("never returns circuit_open when CB is disabled", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", (now - 10_000).toString()],
          ["bucket_tokens", "0"],
          ["bucket_refilled_at", now.toString()],
        ]),
      );

      const { reason } = runAdmit(store, {
        now,
        cooldownMs: 120_000,
        cbEnabled: false,
      });

      expect(reason).not.toBe("circuit_open");
    });
  });
});
