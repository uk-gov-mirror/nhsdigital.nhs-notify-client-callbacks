import {
  type CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { DeliveryMetricsSnapshot, MetricsSnapshot } from "types";

const INSIGHTS_POLL_INTERVAL_MS = 2000;
const INSIGHTS_TIMEOUT_MS = 30_000;

type ResultField = { field?: string; value?: string };

async function pollQueryResults<T>(
  client: CloudWatchLogsClient,
  queryId: string,
  mapRow: (row: ResultField[]) => T,
): Promise<T | null> {
  const zeroResult = mapRow([]);
  const deadline = Date.now() + INSIGHTS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, INSIGHTS_POLL_INTERVAL_MS);
    });

    const response = await client.send(new GetQueryResultsCommand({ queryId }));

    if (response.status === "Failed" || response.status === "Cancelled") {
      return null;
    }

    if (response.status === "Complete") {
      const row = response.results?.[0];
      if (!row) return zeroResult;
      return mapRow(row);
    }
  }

  return null;
}

export async function queryMetricsSnapshot(
  client: CloudWatchLogsClient,
  logGroupName: string,
  startTimeSec: number,
  endTimeSec: number,
): Promise<MetricsSnapshot | null> {
  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        'filter msg = "Callback lifecycle: batch-processing-completed"',
        "| stats count(*) as eventCount, pct(processingTimeMs, 50) as p50, pct(processingTimeMs, 95) as p95, pct(processingTimeMs, 99) as p99",
      ].join("\n"),
    }),
  );

  if (!queryId) return null;

  return pollQueryResults(client, queryId, (row) => {
    const getField = (name: string): number =>
      Number(row.find((f) => f.field === name)?.value ?? 0);

    return {
      snapshotAt: Date.now(),
      p50Ms: getField("p50"),
      p95Ms: getField("p95"),
      p99Ms: getField("p99"),
      count: getField("eventCount"),
    };
  });
}

export async function queryDeliveryMetricsSnapshot(
  client: CloudWatchLogsClient,
  logGroupNames: string[],
  startTimeSec: number,
  endTimeSec: number,
): Promise<DeliveryMetricsSnapshot | null> {
  if (logGroupNames.length === 0) return null;

  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupNames,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        "filter ispresent(DeliveryDurationMs)",
        "| stats count(DeliveryDurationMs) as deliveryCount, pct(DeliveryDurationMs, 50) as p50, pct(DeliveryDurationMs, 95) as p95, pct(DeliveryDurationMs, 99) as p99",
      ].join("\n"),
    }),
  );

  if (!queryId) return null;

  return pollQueryResults(client, queryId, (row) => {
    const getField = (name: string): number =>
      Number(row.find((f) => f.field === name)?.value ?? 0);

    return {
      snapshotAt: Date.now(),
      deliveryCount: getField("deliveryCount"),
      p50Ms: getField("p50"),
      p95Ms: getField("p95"),
      p99Ms: getField("p99"),
    };
  });
}
