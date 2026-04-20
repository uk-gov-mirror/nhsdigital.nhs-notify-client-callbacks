import recordResultLuaSrc from "services/record-result.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

// ARGV: [now, success, cooldownMs, decayPeriodMs, cbErrorThreshold, cbMinAttempts, cbWindowPeriodMs]
// KEYS: [cbKey]
// Returns: [ok (0|1), state]  state: "closed" | "opened" | "failed"

type RecordResultArgs = {
  now: number;
  success: boolean;
  cooldownMs: number;
  decayPeriodMs: number;
  cbErrorThreshold: number;
  cbMinAttempts: number;
  cbWindowPeriodMs: number;
};

const defaultArgs: RecordResultArgs = {
  now: 1_000_000,
  success: true,
  cooldownMs: 60_000,
  decayPeriodMs: 300_000,
  cbErrorThreshold: 0.5,
  cbMinAttempts: 10,
  cbWindowPeriodMs: 60_000,
};

type RecordResultResult = [number, string];

function runRecordResult(
  store: ReturnType<typeof createRedisStore>,
  args: Partial<RecordResultArgs> = {},
  targetId = "t1",
): RecordResultResult {
  const merged = { ...defaultArgs, ...args };
  return evalLua(
    recordResultLuaSrc,
    [`cb:${targetId}`],
    [
      merged.now.toString(),
      merged.success ? "1" : "0",
      merged.cooldownMs.toString(),
      merged.decayPeriodMs.toString(),
      merged.cbErrorThreshold.toString(),
      merged.cbMinAttempts.toString(),
      merged.cbWindowPeriodMs.toString(),
    ],
    store,
  ) as RecordResultResult;
}

describe("record-result.lua", () => {
  describe("success recording", () => {
    it("returns closed state for a successful result", () => {
      const store = createRedisStore();
      const [ok, state] = runRecordResult(store, { success: true });

      expect(ok).toBe(1);
      expect(state).toBe("closed");
    });

    it("increments attempt count without incrementing failures", () => {
      const store = createRedisStore();
      runRecordResult(store, { success: true });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_attempts")).toBe("1");
      expect(cbHash.get("cb_failures")).toBe("0");
    });
  });

  describe("failure recording", () => {
    it("increments both attempts and failures on error", () => {
      const store = createRedisStore();
      runRecordResult(store, { success: false });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_attempts")).toBe("1");
      expect(cbHash.get("cb_failures")).toBe("1");
    });

    it("returns failed state for a single failure below threshold", () => {
      const store = createRedisStore();
      const [ok, state] = runRecordResult(store, { success: false });

      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });

    it("stays closed when below error threshold", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 8; i++) {
        runRecordResult(store, { now, success: true });
      }
      for (let i = 0; i < 2; i++) {
        runRecordResult(store, { now, success: false });
      }

      const [ok, state] = runRecordResult(store, { now, success: true });
      expect(ok).toBe(1);
      expect(state).toBe("closed");
    });
  });

  describe("circuit opening", () => {
    it("opens circuit when error rate exceeds threshold", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 4; i++) {
        const [, state] = runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
        expect(state).toBe("failed");
      }

      const [ok, state] = runRecordResult(store, {
        now,
        success: false,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(ok).toBe(0);
      expect(state).toBe("opened");
    });

    it("does not open circuit when below minimum attempts", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 4; i++) {
        runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 10,
        });
      }

      const [ok, state] = runRecordResult(store, {
        now,
        success: false,
        cbMinAttempts: 10,
      });
      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });

    it("sets opened_until_ms with cooldown on open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const cooldownMs = 30_000;

      for (let i = 0; i < 5; i++) {
        runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
          cooldownMs,
        });
      }

      const cbHash = store.get("cb:t1")!;
      expect(Number(cbHash.get("opened_until_ms"))).toBe(now + cooldownMs);
    });

    it("resets all counters on open", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 5; i++) {
        runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_failures")).toBe("0");
      expect(cbHash.get("cb_attempts")).toBe("0");
      expect(cbHash.get("cb_window_from")).toBe("0");
      expect(cbHash.get("cb_prev_failures")).toBe("0");
      expect(cbHash.get("cb_prev_attempts")).toBe("0");
    });

    it("does not double-trip when circuit is already open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const openedUntil = now + 60_000;

      store.set(
        "cb:t1",
        new Map([
          ["opened_until_ms", openedUntil.toString()],
          ["cb_window_from", now.toString()],
        ]),
      );

      for (let i = 0; i < 20; i++) {
        const [, state] = runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
        expect(state).toBe("failed");
      }

      const cbHash = store.get("cb:t1")!;
      expect(Number(cbHash.get("opened_until_ms"))).toBe(openedUntil);
    });
  });

  describe("two-window blended rate", () => {
    it("blends previous window failures into current assessment", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const cbWindowPeriodMs = 60_000;

      store.set(
        "cb:t1",
        new Map([
          ["cb_window_from", now.toString()],
          ["cb_prev_failures", "8"],
          ["cb_prev_attempts", "10"],
        ]),
      );

      const [ok, state] = runRecordResult(store, {
        now,
        success: false,
        cbWindowPeriodMs,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(ok).toBe(0);
      expect(state).toBe("opened");
    });

    it("reduces previous window weight as current window ages", () => {
      const store = createRedisStore();
      const cbWindowPeriodMs = 100_000;
      const t0 = 1_000_000;
      const nearEnd = t0 + cbWindowPeriodMs - 1;

      store.set(
        "cb:t1",
        new Map([
          ["cb_window_from", t0.toString()],
          ["cb_prev_failures", "10"],
          ["cb_prev_attempts", "10"],
        ]),
      );

      for (let i = 0; i < 20; i++) {
        runRecordResult(store, {
          now: nearEnd,
          success: true,
          cbWindowPeriodMs,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const [, state] = runRecordResult(store, {
        now: nearEnd,
        success: false,
        cbWindowPeriodMs,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(state).toBe("failed");
    });

    it("ignores previous window when cbWindowPeriodMs is 0", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      store.set(
        "cb:t1",
        new Map([
          ["cb_window_from", now.toString()],
          ["cb_prev_failures", "100"],
          ["cb_prev_attempts", "100"],
        ]),
      );

      const [, state] = runRecordResult(store, {
        now,
        success: false,
        cbWindowPeriodMs: 0,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(state).toBe("failed");
    });
  });

  describe("decay period", () => {
    it("preserves opened_until_ms during active decay", () => {
      const store = createRedisStore();
      const openedUntil = 1_060_000;
      const duringDecay = openedUntil + 100_000;

      store.set(
        "cb:t1",
        new Map([["opened_until_ms", openedUntil.toString()]]),
      );

      runRecordResult(store, {
        now: duringDecay,
        success: true,
        decayPeriodMs: 300_000,
      });

      const cbHash = store.get("cb:t1")!;
      expect(Number(cbHash.get("opened_until_ms"))).toBe(openedUntil);
    });

    it("clears opened_until_ms after decay period elapses", () => {
      const store = createRedisStore();
      const openedUntil = 1_060_000;
      const decayPeriodMs = 300_000;
      const afterDecay = openedUntil + decayPeriodMs + 1;

      store.set(
        "cb:t1",
        new Map([["opened_until_ms", openedUntil.toString()]]),
      );

      runRecordResult(store, {
        now: afterDecay,
        success: true,
        decayPeriodMs,
      });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("opened_until_ms")).toBe("0");
    });

    it("clears opened_until_ms when circuit was never opened", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      runRecordResult(store, { now, success: true });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("opened_until_ms")).toBe("0");
    });
  });

  describe("state persistence", () => {
    it("writes all counter fields to redis", () => {
      const store = createRedisStore();
      runRecordResult(store);

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.has("opened_until_ms")).toBe(true);
      expect(cbHash.has("cb_window_from")).toBe(true);
      expect(cbHash.has("cb_failures")).toBe(true);
      expect(cbHash.has("cb_attempts")).toBe(true);
      expect(cbHash.has("cb_prev_failures")).toBe(true);
      expect(cbHash.has("cb_prev_attempts")).toBe(true);
    });
  });
});
