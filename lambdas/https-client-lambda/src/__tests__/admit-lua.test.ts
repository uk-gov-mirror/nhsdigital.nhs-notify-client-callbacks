import admitLuaSrc from "services/admit.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

type AdmitArgs = {
  now: number;
  refillPerSec: number;
  capacity: number;
  cbProbeIntervalMs: number;
  cbEnabled: boolean;
  decayPeriodMs: number;
};

const defaultArgs: AdmitArgs = {
  now: 1_000_000,
  refillPerSec: 10,
  capacity: 10,
  cbProbeIntervalMs: 60_000,
  cbEnabled: true,
  decayPeriodMs: 300_000,
};

function runAdmit(
  store: ReturnType<typeof createRedisStore>,
  args: Partial<AdmitArgs> = {},
  targetId = "t1",
) {
  const merged = { ...defaultArgs, ...args };
  return evalLua(
    admitLuaSrc,
    [`rl:${targetId}`, `cb:${targetId}`],
    [
      merged.now.toString(),
      merged.refillPerSec.toString(),
      merged.capacity.toString(),
      merged.cbProbeIntervalMs.toString(),
      merged.cbEnabled ? "1" : "0",
      merged.decayPeriodMs.toString(),
    ],
    store,
  );
}

describe("admit.lua", () => {
  describe("rate limiting", () => {
    it("allows the first request with full token bucket", () => {
      const store = createRedisStore();
      const result = runAdmit(store);

      expect(result).toEqual({
        allowed: true,
        probe: false,
        effectiveRate: 10,
      });
    });

    it("deducts tokens on each call", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        const result = runAdmit(store);
        expect(result).toMatchObject({ allowed: true });
      }

      const result = runAdmit(store);
      expect(result).toMatchObject({
        allowed: false,
        reason: "rate_limited",
      });
    });

    it("returns retryAfterMs when rate limited", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        runAdmit(store);
      }

      const result = runAdmit(store);
      expect(result).toMatchObject({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: expect.any(Number),
      });
      expect((result as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(
        0,
      );
    });

    it("refills tokens over time", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 10; i++) {
        runAdmit(store, { now });
      }

      const denied = runAdmit(store, { now });
      expect(denied).toMatchObject({ allowed: false });

      const later = now + 1000;
      const result = runAdmit(store, { now: later });
      expect(result).toMatchObject({ allowed: true });
    });

    it("caps tokens at capacity", () => {
      const store = createRedisStore();

      const result = runAdmit(store, {
        now: 1_000_000,
        capacity: 5,
        refillPerSec: 100,
      });
      expect(result).toMatchObject({ allowed: true });

      const rlHash = store.get("rl:t1");
      const tokensRaw = rlHash?.get("tokens");
      expect(tokensRaw).toBeDefined();
      const tokens = Number.parseFloat(tokensRaw ?? "");
      expect(tokens).toBeLessThanOrEqual(4);
    });

    it("handles zero refill rate", () => {
      const store = createRedisStore();

      for (let i = 0; i < 10; i++) {
        runAdmit(store, { refillPerSec: 0 });
      }

      const result = runAdmit(store, { refillPerSec: 0 });
      expect(result).toMatchObject({
        allowed: false,
        reason: "rate_limited",
        retryAfterMs: 1000,
      });
    });
  });

  describe("circuit breaker", () => {
    it("blocks requests when circuit is open", () => {
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

      const result = runAdmit(store, { now });
      expect(result).toMatchObject({
        allowed: false,
        reason: "circuit_open",
        effectiveRate: 0,
      });
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

      const result = runAdmit(store, { now });
      expect(result).toMatchObject({
        allowed: false,
        reason: "circuit_open",
        retryAfterMs: 30_000,
      });
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

      const result = runAdmit(store, {
        now,
        cbProbeIntervalMs: 60_000,
      });
      expect(result).toEqual({
        allowed: true,
        probe: true,
        effectiveRate: 0,
      });

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

      const result = runAdmit(store, {
        now,
        cbProbeIntervalMs: 60_000,
      });
      expect(result).toMatchObject({
        allowed: false,
        reason: "circuit_open",
      });
    });

    it("skips circuit breaker when disabled", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 60_000;

      store.set(
        "cb:t1",
        new Map([["opened_until_ms", openedUntil.toString()]]),
      );

      const result = runAdmit(store, { now, cbEnabled: false });
      expect(result).toMatchObject({ allowed: true, probe: false });
    });
  });

  describe("decay scaling", () => {
    it("applies reduced rate during decay period", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const halfwayThrough = closedAt + decayPeriodMs / 2;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const result = runAdmit(store, {
        now: halfwayThrough,
        refillPerSec: 10,
        decayPeriodMs,
      });
      expect(result).toMatchObject({ allowed: true });
      expect((result as { effectiveRate: number }).effectiveRate).toBeCloseTo(
        5,
        0,
      );
    });

    it("uses full rate after decay period ends", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const afterDecay = closedAt + decayPeriodMs + 1;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const result = runAdmit(store, {
        now: afterDecay,
        refillPerSec: 10,
        decayPeriodMs,
      });
      expect(result).toMatchObject({
        allowed: true,
        effectiveRate: 10,
      });
    });

    it("clamps minimum effective rate to 0.001", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;
      const decayPeriodMs = 300_000;
      const veryEarly = closedAt + 1;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const result = runAdmit(store, {
        now: veryEarly,
        refillPerSec: 10,
        decayPeriodMs,
      });
      const rate = (result as { effectiveRate: number }).effectiveRate;
      expect(rate).toBeGreaterThanOrEqual(0.001);
    });

    it("does not decay when decayPeriodMs is 0", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const result = runAdmit(store, {
        now: closedAt + 1,
        refillPerSec: 10,
        decayPeriodMs: 0,
      });
      expect(result).toMatchObject({
        allowed: true,
        effectiveRate: 10,
      });
    });

    it("does not decay when circuit breaker is disabled", () => {
      const store = createRedisStore();
      const closedAt = 1_000_000;

      store.set("cb:t1", new Map([["opened_until_ms", closedAt.toString()]]));

      const result = runAdmit(store, {
        now: closedAt + 1,
        refillPerSec: 10,
        decayPeriodMs: 300_000,
        cbEnabled: false,
      });
      expect(result).toMatchObject({
        allowed: true,
        effectiveRate: 10,
      });
    });
  });

  describe("redis state persistence", () => {
    it("persists token count and last_refill_ms", () => {
      const store = createRedisStore();
      runAdmit(store, { now: 1_000_000, capacity: 5 });

      const rlHash = store.get("rl:t1")!;
      expect(rlHash.get("tokens")).toBeDefined();
      expect(rlHash.get("last_refill_ms")).toBe("1000000");
    });
  });
});
