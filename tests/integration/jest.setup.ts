import { performance } from "node:perf_hooks";
import { logger } from "@nhs-notify-client-callbacks/logger";

const testStartTimes = new Map<string, number>();

beforeEach(() => {
  const testName = expect.getState().currentTestName ?? "unknown test";
  const now = performance.now();
  testStartTimes.set(testName, now);
  logger.info(`[TEST START] ${testName}`);
});

afterEach(() => {
  const testName = expect.getState().currentTestName ?? "unknown test";
  const startedAt = testStartTimes.get(testName);
  const durationMs =
    startedAt === undefined
      ? undefined
      : Math.round(performance.now() - startedAt);
  const durationSuffix = durationMs === undefined ? "" : ` (${durationMs}ms)`;

  logger.info(`[TEST FINISH] ${testName}${durationSuffix}`);
  testStartTimes.delete(testName);
});
