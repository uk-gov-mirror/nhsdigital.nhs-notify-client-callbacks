import recordResultLuaSrc from "services/record-result.lua";
import { createRedisStore, evalLua } from "__tests__/helpers/lua-redis-mock";

// ARGV: [now, consumedTokens, processingFailures, cooldownPeriodMs, recoveryPeriodMs, failureThreshold, minAttempts, samplePeriodMs]
// KEYS: [epKey]
// Returns: [ok (0|1), state]  state: "closed" | "opened" | "failed"

type RecordResultArgs = {
  now: number;
  consumedTokens: number;
  processingFailures: number;
  cooldownPeriodMs: number;
  recoveryPeriodMs: number;
  failureThreshold: number;
  minAttempts: number;
  samplePeriodMs: number;
};

const defaultArgs: RecordResultArgs = {
  now: 1_000_000,
  consumedTokens: 1,
  processingFailures: 0,
  cooldownPeriodMs: 120_000,
  recoveryPeriodMs: 600_000,
  failureThreshold: 0.3,
  minAttempts: 5,
  samplePeriodMs: 300_000,
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
    [`ep:${targetId}`],
    [
      merged.now.toString(),
      merged.consumedTokens.toString(),
      merged.processingFailures.toString(),
      merged.cooldownPeriodMs.toString(),
      merged.recoveryPeriodMs.toString(),
      merged.failureThreshold.toString(),
      merged.minAttempts.toString(),
      merged.samplePeriodMs.toString(),
    ],
    store,
  ) as RecordResultResult;
}

describe("record-result.lua", () => {
  describe("success recording", () => {
    it("returns ok state for a successful batch", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      const [ok, state] = runRecordResult(store, {
        consumedTokens: 5,
        processingFailures: 0,
      });

      expect(ok).toBe(1);
      expect(state).toBe("ok");
    });

    it("increments cur_attempts without incrementing cur_failures", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      runRecordResult(store, { consumedTokens: 3, processingFailures: 0 });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("cur_attempts")).toBe("3");
      expect(epHash.get("cur_failures")).toBe("0");
    });
  });

  describe("failure recording", () => {
    it("increments both cur_attempts and cur_failures", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      runRecordResult(store, { consumedTokens: 5, processingFailures: 1 });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("cur_attempts")).toBe("5");
      expect(epHash.get("cur_failures")).toBe("1");
    });

    it("returns failed state for failures below threshold", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      const [ok, state] = runRecordResult(store, {
        consumedTokens: 1,
        processingFailures: 1,
      });

      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });
  });

  describe("recording guard — fully open", () => {
    it("does not record attempts/failures when circuit is fully open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 10_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["sample_till", "9999999999"],
          ["cur_attempts", "0"],
          ["cur_failures", "0"],
        ]),
      );

      runRecordResult(store, {
        now,
        cooldownPeriodMs: 120_000,
        consumedTokens: 5,
        processingFailures: 3,
      });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("cur_attempts")).toBe("0");
      expect(epHash.get("cur_failures")).toBe("0");
    });

    it("returns failed when circuit is fully open and state unchanged", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 10_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["sample_till", "9999999999"],
        ]),
      );

      const [ok, state] = runRecordResult(store, {
        now,
        cooldownPeriodMs: 120_000,
        consumedTokens: 1,
        processingFailures: 0,
      });

      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });
  });

  describe("circuit opening", () => {
    it("opens circuit when failure rate exceeds threshold", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      const [ok, state] = runRecordResult(store, {
        consumedTokens: 5,
        processingFailures: 5,
        minAttempts: 5,
        failureThreshold: 0.3,
      });
      expect(ok).toBe(0);
      expect(state).toBe("opened");
    });

    it("does not open circuit when below minimum attempts", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      const [ok, state] = runRecordResult(store, {
        consumedTokens: 3,
        processingFailures: 3,
        minAttempts: 5,
        failureThreshold: 0.3,
      });
      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });

    it("sets is_open and switched_at on open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      runRecordResult(store, {
        now,
        consumedTokens: 5,
        processingFailures: 5,
        minAttempts: 5,
        failureThreshold: 0.3,
      });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("is_open")).toBe("1");
      expect(Number(epHash.get("switched_at"))).toBe(now);
    });

    it("resets all counters and sets sampleTill on open", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const samplePeriodMs = 300_000;
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));

      runRecordResult(store, {
        now,
        consumedTokens: 5,
        processingFailures: 5,
        minAttempts: 5,
        failureThreshold: 0.3,
        samplePeriodMs,
      });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("cur_failures")).toBe("0");
      expect(epHash.get("cur_attempts")).toBe("0");
      expect(epHash.get("prev_failures")).toBe("0");
      expect(epHash.get("prev_attempts")).toBe("0");
      expect(Number(epHash.get("sample_till"))).toBe(now + samplePeriodMs);
    });
  });

  describe("circuit closing — half-open with successes", () => {
    it("closes circuit when half-open and batch has successes", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 130_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["sample_till", "9999999999"],
        ]),
      );

      const [ok, state] = runRecordResult(store, {
        now,
        cooldownPeriodMs: 120_000,
        consumedTokens: 1,
        processingFailures: 0,
      });

      expect(ok).toBe(1);
      expect(state).toBe("closed");

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("is_open")).toBe("0");
      expect(Number(epHash.get("switched_at"))).toBe(now);
    });

    it("does not close when half-open but all attempts failed", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const switchedAt = now - 130_000;

      store.set(
        "ep:t1",
        new Map([
          ["is_open", "1"],
          ["switched_at", switchedAt.toString()],
          ["sample_till", "9999999999"],
        ]),
      );

      const [ok, state] = runRecordResult(store, {
        now,
        cooldownPeriodMs: 120_000,
        consumedTokens: 1,
        processingFailures: 1,
      });

      expect(ok).toBe(0);
      expect(state).toBe("failed");
    });
  });

  describe("sliding window management", () => {
    it("promotes current to previous when sampleTill expires", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const samplePeriodMs = 300_000;
      const sampleTill = now - 1;

      store.set(
        "ep:t1",
        new Map([
          ["sample_till", sampleTill.toString()],
          ["cur_attempts", "10"],
          ["cur_failures", "3"],
          ["prev_attempts", "0"],
          ["prev_failures", "0"],
        ]),
      );

      runRecordResult(store, { now, samplePeriodMs, consumedTokens: 1 });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("prev_attempts")).toBe("10");
      expect(epHash.get("prev_failures")).toBe("3");
      expect(Number(epHash.get("sample_till"))).toBe(
        sampleTill + samplePeriodMs,
      );
    });

    it("complete reset when window is too old", () => {
      const store = createRedisStore();
      const now = 1_000_000;
      const samplePeriodMs = 300_000;
      const sampleTill = now - samplePeriodMs - 1;

      store.set(
        "ep:t1",
        new Map([
          ["sample_till", sampleTill.toString()],
          ["cur_attempts", "10"],
          ["cur_failures", "3"],
          ["prev_attempts", "5"],
          ["prev_failures", "2"],
        ]),
      );

      runRecordResult(store, { now, samplePeriodMs, consumedTokens: 1 });

      const epHash = store.get("ep:t1")!;
      expect(epHash.get("prev_attempts")).toBe("0");
      expect(epHash.get("prev_failures")).toBe("0");
      expect(Number(epHash.get("sample_till"))).toBe(now + samplePeriodMs);
    });

    it("interpolates using weight from sampleTill", () => {
      const store = createRedisStore();
      const samplePeriodMs = 300_000;
      const now = 1_000_000;
      const sampleTill = now + samplePeriodMs;

      store.set(
        "ep:t1",
        new Map([
          ["sample_till", sampleTill.toString()],
          ["prev_attempts", "10"],
          ["prev_failures", "10"],
        ]),
      );

      // weight = (sampleTill - now) / samplePeriodMs = 1.0
      // interpolated attempts = 10 * 1.0 + 5 = 15 (>= minAttempts 5)
      // interpolated failures = 10 * 1.0 + 5 = 15
      // failure rate = 15/15 = 1.0 > 0.3 → opens
      const [ok, state] = runRecordResult(store, {
        now,
        samplePeriodMs,
        consumedTokens: 5,
        processingFailures: 5,
        minAttempts: 5,
        failureThreshold: 0.3,
      });
      expect(ok).toBe(0);
      expect(state).toBe("opened");
    });
  });

  describe("state persistence", () => {
    it("writes all sampling fields to redis", () => {
      const store = createRedisStore();
      store.set("ep:t1", new Map([["sample_till", "9999999999"]]));
      runRecordResult(store);

      const epHash = store.get("ep:t1")!;
      expect(epHash.has("cur_attempts")).toBe(true);
      expect(epHash.has("cur_failures")).toBe(true);
      expect(epHash.has("prev_attempts")).toBe(true);
      expect(epHash.has("prev_failures")).toBe(true);
      expect(epHash.has("sample_till")).toBe(true);
    });
  });
});
