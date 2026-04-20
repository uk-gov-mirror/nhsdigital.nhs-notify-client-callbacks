import admitLuaSrc from "services/admit.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

// ARGV: [now, capacity, refillPerSec, cooldownMs, decayPeriodMs, cbWindowPeriodMs, cbProbeIntervalMs]
// KEYS: [cbKey, rlKey]
// Returns: [allowed (0|1), reason, retryAfterMs, effectiveRate]

type AdmitArgs = {
  now: number;
  capacity: number;
  refillPerSec: number;
  cooldownMs: number;
  decayPeriodMs: number;
  cbWindowPeriodMs: number;
  cbProbeIntervalMs: number;
};

const defaultArgs: AdmitArgs = {
  now: 1_000_000,
  capacity: 10,
  refillPerSec: 10,
  cooldownMs: 60_000,
  decayPeriodMs: 300_000,
  cbWindowPeriodMs: 60_000,
  cbProbeIntervalMs: 60_000,
};

type AdmitResult = {
  allowed: number;
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
    [`cb:${targetId}`, `rl:${targetId}`],
    [
      merged.now.toString(),
      merged.capacity.toString(),
      merged.refillPerSec.toString(),
      merged.cooldownMs.toString(),
      merged.decayPeriodMs.toString(),
      merged.cbWindowPeriodMs.toString(),
      merged.cbProbeIntervalMs.toString(),
    ],
    store,
  ) as [number, string, number, number];
  return {
    allowed: raw[0],
    reason: raw[1],
    retryAfterMs: raw[2],
    effectiveRate: raw[3],
  };
}

describe("admit.lua", () => {
  describe("rate limiting", () => {
    it("allows the first request with full token bucket", () => {
      const store = createRedisStore();
      const { allowed, effectiveRate, reason, retryAfterMs } = runAdmit(store);

      expect(allowed).toBe(1);
      expect(reason).toBe("allowed");
      expect(retryAfterMs).toBe(0);
      expect(effectiveRate).toBe(10);
    });

    it("depletes tokens on consecutive calls and rejects when empty", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        const { allowed } = runAdmit(store);
        expect(allowed).toBe(1);
      }

      const { allowed, reason } = runAdmit(store);
      expect(allowed).toBe(0);
      expect(reason).toBe("rate_limited");
    });

    it("returns retryAfterMs when rate limited", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        runAdmit(store);
      }

      const { retryAfterMs } = runAdmit(store);
      expect(retryAfterMs).toBe(1000);
    });

    it("reports effective rate when rate limited", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        runAdmit(store);
      }

      const { effectiveRate } = runAdmit(store);
      expect(effectiveRate).toBe(10);
    });

    it("refills tokens over time", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 10; i++) {
        runAdmit(store, { now });
      }

      const denied = runAdmit(store, { now });
      expect(denied.allowed).toBe(0);

      const refilled = runAdmit(store, { now: now + 1000 });
      expect(refilled.allowed).toBe(1);
    });

    it("caps tokens at capacity", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      runAdmit(store, { now, capacity: 5, refillPerSec: 100 });

      // Advance 10 seconds — would add 1000 tokens without cap
      runAdmit(store, { now: now + 10_000, capacity: 5, refillPerSec: 100 });

      const rlHash = store.get("rl:t1")!;
      // Refill capped to capacity (5), then one consumed → 4
      expect(Number(rlHash.get("tokens"))).toBe(4);
    });

    it("handles zero refill rate", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        runAdmit(store, { refillPerSec: 0 });
      }

      const { allowed, reason, retryAfterMs } = runAdmit(store, {
        refillPerSec: 0,
      });
      expect(allowed).toBe(0);
      expect(reason).toBe("rate_limited");
      expect(retryAfterMs).toBe(1000);
    });
  });

  describe("circuit breaker", () => {
    it("rejects when circuit is open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 60_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", now.toString()],
        ]),
      );

      const { allowed, effectiveRate, reason } = runAdmit(store, { now });
      expect(allowed).toBe(0);
      expect(reason).toBe("circuit_open");
      expect(effectiveRate).toBe(0);
    });

    it("returns retryAfterMs for open circuit", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 30_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", now.toString()],
        ]),
      );

      const { retryAfterMs } = runAdmit(store, { now });
      expect(retryAfterMs).toBe(30_000);
    });

    it("allows probe when probe interval has elapsed", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 120_000;
      const lastProbe = now - 61_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", lastProbe.toString()],
        ]),
      );

      const { allowed, effectiveRate, reason, retryAfterMs } = runAdmit(store, {
        now,
        cbProbeIntervalMs: 60_000,
      });
      expect(allowed).toBe(1);
      expect(reason).toBe("probe");
      expect(retryAfterMs).toBe(0);
      expect(effectiveRate).toBe(0);
    });

    it("updates last_probe_ms after allowing a probe", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 120_000;
      const lastProbe = now - 61_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", lastProbe.toString()],
        ]),
      );

      runAdmit(store, { now, cbProbeIntervalMs: 60_000 });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("last_probe_ms")).toBe(now.toString());
    });

    it("does not probe when interval has not elapsed", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 120_000;
      const lastProbe = now - 30_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", lastProbe.toString()],
        ]),
      );

      const { allowed, reason } = runAdmit(store, {
        now,
        cbProbeIntervalMs: 60_000,
      });
      expect(allowed).toBe(0);
      expect(reason).toBe("circuit_open");
    });

    it("does not probe when cbProbeIntervalMs is 0", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 120_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["last_probe_ms", "0"],
        ]),
      );

      const { allowed, reason } = runAdmit(store, {
        now,
        cbProbeIntervalMs: 0,
      });
      expect(allowed).toBe(0);
      expect(reason).toBe("circuit_open");
    });
  });

  describe("sliding window", () => {
    it("initialises cbWindowFrom on first call", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      runAdmit(store, { now });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_window_from")).toBe(now.toString());
    });

    it("rolls current window to previous when period expires", () => {
      const store = createRedisStore();
      const cbWindowPeriodMs = 60_000;
      const t0 = 1_000_000;
      const t1 = t0 + cbWindowPeriodMs + 1;

      store.set(
        "cb:t1",
        new Map([
          ["cb_window_from", t0.toString()],
          ["cb_failures", "5"],
          ["cb_attempts", "10"],
          ["cb_prev_failures", "0"],
          ["cb_prev_attempts", "0"],
        ]),
      );

      runAdmit(store, { now: t1, cbWindowPeriodMs });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_prev_failures")).toBe("5");
      expect(cbHash.get("cb_prev_attempts")).toBe("10");
      expect(cbHash.get("cb_failures")).toBe("0");
      expect(cbHash.get("cb_attempts")).toBe("0");
      expect(cbHash.get("cb_window_from")).toBe(t1.toString());
    });

    it("clears both windows when gap exceeds two periods", () => {
      const store = createRedisStore();
      const cbWindowPeriodMs = 60_000;
      const t0 = 1_000_000;
      const t1 = t0 + 2 * cbWindowPeriodMs + 1;

      store.set(
        "cb:t1",
        new Map([
          ["cb_window_from", t0.toString()],
          ["cb_failures", "5"],
          ["cb_attempts", "10"],
          ["cb_prev_failures", "3"],
          ["cb_prev_attempts", "7"],
        ]),
      );

      runAdmit(store, { now: t1, cbWindowPeriodMs });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_prev_failures")).toBe("0");
      expect(cbHash.get("cb_prev_attempts")).toBe("0");
      expect(cbHash.get("cb_failures")).toBe("0");
      expect(cbHash.get("cb_attempts")).toBe("0");
      expect(cbHash.get("cb_window_from")).toBe(t1.toString());
    });
  });

  describe("decay scaling", () => {
    it("applies reduced rate during decay period", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const halfwayThrough = closedAt + decayPeriodMs / 2;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const { effectiveRate } = runAdmit(store, {
        now: halfwayThrough,
        refillPerSec: 10,
        decayPeriodMs,
      });
      expect(effectiveRate).toBe(5);
    });

    it("uses full rate after decay period ends", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const afterDecay = closedAt + decayPeriodMs + 1;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const { allowed, effectiveRate } = runAdmit(store, {
        now: afterDecay,
        refillPerSec: 10,
        decayPeriodMs,
      });
      expect(allowed).toBe(1);
      expect(effectiveRate).toBe(10);
    });

    it("clamps minimum effective rate to 1", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const veryEarly = closedAt + 1;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const { effectiveRate } = runAdmit(store, {
        now: veryEarly,
        refillPerSec: 10,
        decayPeriodMs,
      });
      expect(effectiveRate).toBeGreaterThanOrEqual(1);
    });

    it("clears openedUntil when decay period fully elapses", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const afterDecay = closedAt + decayPeriodMs + 1;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      runAdmit(store, { now: afterDecay, decayPeriodMs });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("opened_until_ms")).toBe("0");
    });

    it("does not decay when decayPeriodMs is 0", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const { allowed, effectiveRate } = runAdmit(store, {
        now: closedAt + 1,
        refillPerSec: 10,
        decayPeriodMs: 0,
      });
      expect(allowed).toBe(1);
      expect(effectiveRate).toBe(10);
    });
  });

  describe("state persistence", () => {
    it("persists token count and last_refill_ms", () => {
      const store = createRedisStore();
      runAdmit(store, { now: 1_000_000, capacity: 5 });

      const rlHash = store.get("rl:t1")!;
      expect(rlHash.get("tokens")).toBeDefined();
      expect(rlHash.get("last_refill_ms")).toBe("1000000");
    });

    it("persists circuit breaker fields", () => {
      const store = createRedisStore();
      runAdmit(store, { now: 1_000_000 });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.has("opened_until_ms")).toBe(true);
      expect(cbHash.has("cb_window_from")).toBe(true);
      expect(cbHash.has("cb_failures")).toBe(true);
      expect(cbHash.has("cb_attempts")).toBe(true);
      expect(cbHash.has("cb_prev_failures")).toBe(true);
      expect(cbHash.has("cb_prev_attempts")).toBe(true);
    });

    it("isolates state between targets", () => {
      const store = createRedisStore();
      runAdmit(store, {}, "target-a");
      runAdmit(store, {}, "target-b");

      expect(store.has("cb:target-a")).toBe(true);
      expect(store.has("cb:target-b")).toBe(true);
      expect(store.has("rl:target-a")).toBe(true);
      expect(store.has("rl:target-b")).toBe(true);
    });
  });
});
