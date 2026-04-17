import recordResultLuaSrc from "services/record-result.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

type RecordResultArgs = {
  now: number;
  success: boolean;
  cbWindowPeriodMs: number;
  cbErrorThreshold: number;
  cbMinAttempts: number;
  cbCooldownMs: number;
  decayPeriodMs: number;
};

const defaultArgs: RecordResultArgs = {
  now: 1_000_000,
  success: true,
  cbWindowPeriodMs: 60_000,
  cbErrorThreshold: 0.5,
  cbMinAttempts: 10,
  cbCooldownMs: 60_000,
  decayPeriodMs: 300_000,
};

function runRecordResult(
  store: ReturnType<typeof createRedisStore>,
  args: Partial<RecordResultArgs> = {},
  targetId = "t1",
) {
  const merged = { ...defaultArgs, ...args };
  return evalLua(
    recordResultLuaSrc,
    [`cb:${targetId}`],
    [
      merged.now.toString(),
      merged.success ? "1" : "0",
      merged.cbWindowPeriodMs.toString(),
      merged.cbErrorThreshold.toString(),
      merged.cbMinAttempts.toString(),
      merged.cbCooldownMs.toString(),
      merged.decayPeriodMs.toString(),
    ],
    store,
  );
}

describe("record-result.lua", () => {
  describe("success recording", () => {
    it("returns closed state for a successful result", () => {
      const store = createRedisStore();
      const result = runRecordResult(store, { success: true });
      expect(result).toEqual({ ok: true, state: "closed" });
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

    it("stays closed when below error threshold", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 8; i++) {
        runRecordResult(store, { now, success: true });
      }
      for (let i = 0; i < 2; i++) {
        runRecordResult(store, { now, success: false });
      }

      const result = runRecordResult(store, { now, success: true });
      expect(result).toEqual({ ok: true, state: "closed" });
    });
  });

  describe("circuit opening", () => {
    it("opens circuit when error rate exceeds threshold", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      for (let i = 0; i < 10; i++) {
        runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const result = runRecordResult(store, {
        now,
        success: false,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(result).toEqual({ ok: false, state: "opened" });
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

      const result = runRecordResult(store, {
        now,
        success: false,
        cbMinAttempts: 10,
      });
      expect(result).toEqual({ ok: true, state: "closed" });
    });

    it("sets opened_until_ms with cooldown on open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const cbCooldownMs = 30_000;

      for (let i = 0; i < 10; i++) {
        runRecordResult(store, {
          now,
          success: false,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
          cbCooldownMs,
        });
      }

      const cbHash = store.get("cb:t1")!;
      expect(Number(cbHash.get("opened_until_ms"))).toBe(now + cbCooldownMs);
    });
  });

  describe("window rolling", () => {
    it("rolls window when period expires", () => {
      const store = createRedisStore();
      const windowPeriodMs = 60_000;
      const t0 = 1_000_000;
      const t1 = t0 + windowPeriodMs + 1;

      for (let i = 0; i < 3; i++) {
        runRecordResult(store, {
          now: t0,
          success: false,
          cbWindowPeriodMs: windowPeriodMs,
        });
      }

      runRecordResult(store, {
        now: t1,
        success: true,
        cbWindowPeriodMs: windowPeriodMs,
      });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_prev_failures")).toBe("3");
      expect(cbHash.get("cb_prev_attempts")).toBe("3");
      expect(cbHash.get("cb_attempts")).toBe("1");
      expect(cbHash.get("cb_failures")).toBe("0");
    });

    it("initialises window_from on first call", () => {
      const store = createRedisStore();
      const now = 1_000_000;

      runRecordResult(store, { now });

      const cbHash = store.get("cb:t1")!;
      expect(cbHash.get("cb_window_from")).toBe(now.toString());
    });
  });

  describe("two-window blended rate", () => {
    it("blends previous window failures into current assessment", () => {
      const store = createRedisStore();
      const windowPeriodMs = 60_000;
      const t0 = 1_000_000;

      for (let i = 0; i < 10; i++) {
        runRecordResult(store, {
          now: t0,
          success: false,
          cbWindowPeriodMs: windowPeriodMs,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const justAfterRoll = t0 + windowPeriodMs + 1;
      const result = runRecordResult(store, {
        now: justAfterRoll,
        success: false,
        cbWindowPeriodMs: windowPeriodMs,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });

      expect(result).toEqual({ ok: false, state: "opened" });
    });

    it("reduces previous window weight as current window progresses", () => {
      const store = createRedisStore();
      const windowPeriodMs = 100_000;
      const t0 = 1_000_000;

      for (let i = 0; i < 10; i++) {
        runRecordResult(store, {
          now: t0,
          success: false,
          cbWindowPeriodMs: windowPeriodMs,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const nearEndOfWindow = t0 + windowPeriodMs + windowPeriodMs - 1;
      for (let i = 0; i < 20; i++) {
        runRecordResult(store, {
          now: nearEndOfWindow,
          success: true,
          cbWindowPeriodMs: windowPeriodMs,
          cbMinAttempts: 5,
          cbErrorThreshold: 0.5,
        });
      }

      const result = runRecordResult(store, {
        now: nearEndOfWindow,
        success: true,
        cbWindowPeriodMs: windowPeriodMs,
        cbMinAttempts: 5,
        cbErrorThreshold: 0.5,
      });
      expect(result).toEqual({ ok: true, state: "closed" });
    });
  });

  describe("decay period", () => {
    it("clears opened_until_ms after decay period elapses", () => {
      const store = createRedisStore();
      const openedAt = 1_000_000;
      const cooldownMs = 60_000;
      const decayPeriodMs = 300_000;
      const openedUntil = openedAt + cooldownMs;
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
