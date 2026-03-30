import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { waitUntil } from "async-wait-until";

const POLL_INTERVAL_MS = 2000;
const COLLECT_TIMEOUT_MS = 120_000;

type BatchCompletedLogEntry = {
  processingTimeMs: number;
  batchSize: number;
  successful: number;
  failed: number;
  filtered: number;
};

export async function collectBatchProcessingTimes(
  client: CloudWatchLogsClient,
  logGroupName: string,
  expectedCount: number,
  startTime: number,
): Promise<number[]> {
  const collected: number[] = [];

  await waitUntil(
    async () => {
      const response = await client.send(
        new FilterLogEventsCommand({
          logGroupName,
          startTime,
          filterPattern: '{ $.msg = "batch-processing-completed" }',
        }),
      );

      for (const event of response.events ?? []) {
        if (event.message) {
          try {
            const entry = JSON.parse(event.message) as BatchCompletedLogEntry;
            if (typeof entry.processingTimeMs === "number") {
              collected.push(entry.processingTimeMs);
            }
          } catch {
            // skip unparseable entries
          }
        }
      }

      return collected.length >= expectedCount;
    },
    { timeout: COLLECT_TIMEOUT_MS, intervalBetweenAttempts: POLL_INTERVAL_MS },
  );

  return collected;
}

export function computePercentile(
  samples: number[],
  percentile: number,
): number {
  if (samples.length === 0) {
    throw new Error("Cannot compute percentile of empty array");
  }

  const sorted = [...samples].toSorted((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

const INSIGHTS_QUERY_TIMEOUT_MS = 60_000;
const INSIGHTS_COLLECT_TIMEOUT_MS = 300_000;

async function runInsightsQuery(
  client: CloudWatchLogsClient,
  logGroupName: string,
  startTimeSec: number,
  endTimeSec: number,
  percentile: number,
): Promise<{ count: number; percentileMs: number } | null> {
  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        'filter msg = "batch-processing-completed"',
        `| stats count(*) as eventCount, pct(processingTimeMs, ${percentile}) as p`,
      ].join("\n"),
    }),
  );

  if (!queryId) return null;

  const deadline = Date.now() + INSIGHTS_QUERY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });

    const response = await client.send(new GetQueryResultsCommand({ queryId }));

    if (response.status === "Failed" || response.status === "Cancelled") {
      return null;
    }

    if (response.status === "Complete") {
      const row = response.results?.[0];
      if (!row) return null;

      return {
        count: Number(row.find((f) => f.field === "eventCount")?.value ?? 0),
        percentileMs: Number(row.find((f) => f.field === "p")?.value ?? 0),
      };
    }
  }

  return null;
}

export async function waitForBatchProcessingPercentile(
  client: CloudWatchLogsClient,
  logGroupName: string,
  testStartTime: number,
  expectedCount: number,
  percentile: number,
): Promise<{ count: number; percentileMs: number }> {
  const startTimeSec = Math.floor(testStartTime / 1000);
  let result = { count: 0, percentileMs: 0 };

  await waitUntil(
    async () => {
      const endTimeSec = Math.floor((Date.now() + 60_000) / 1000);
      const queryResult = await runInsightsQuery(
        client,
        logGroupName,
        startTimeSec,
        endTimeSec,
        percentile,
      );

      if (!queryResult) return false;

      result = queryResult;
      return result.count >= expectedCount;
    },
    {
      timeout: INSIGHTS_COLLECT_TIMEOUT_MS,
      intervalBetweenAttempts: POLL_INTERVAL_MS,
    },
  );

  return result;
}
