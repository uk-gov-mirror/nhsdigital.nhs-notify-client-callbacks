import {
  type CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type {
  CircuitBreakerSnapshot,
  DeliveryMetricsSnapshot,
  MetricsSnapshot,
  PerClientRateEntry,
} from "types";

const INSIGHTS_POLL_INTERVAL_MS = 2000;
const INSIGHTS_TIMEOUT_MS = 30_000;

type ResultField = { field?: string; value?: string };

async function pollInsightsQuery(
  client: CloudWatchLogsClient,
  queryId: string,
): Promise<ResultField[][] | null> {
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
      return (response.results as ResultField[][]) ?? [];
    }
  }

  return null;
}

async function pollQueryResults<T>(
  client: CloudWatchLogsClient,
  queryId: string,
  mapRow: (row: ResultField[]) => T,
): Promise<T | null> {
  const rows = await pollInsightsQuery(client, queryId);
  if (rows === null) return null;
  return mapRow(rows[0] ?? []);
}

async function pollAllQueryResults<T>(
  client: CloudWatchLogsClient,
  queryId: string,
  mapRow: (row: ResultField[]) => T,
): Promise<T[]> {
  const rows = await pollInsightsQuery(client, queryId);
  if (rows === null) return [];
  return rows.map((row) => mapRow(row));
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

export async function queryCircuitBreakerSnapshot(
  client: CloudWatchLogsClient,
  logGroupNames: string[],
  startTimeSec: number,
  endTimeSec: number,
): Promise<CircuitBreakerSnapshot | null> {
  if (logGroupNames.length === 0) return null;

  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupNames,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        'filter msg in ["Circuit breaker opened", "Circuit breaker closed", "Admission denied", "Attempting delivery", "Delivery succeeded", "Transient delivery failure \u2014 requeuing", "Permanent delivery failure \u2014 sending to DLQ", "Rate limited (429)"]',
        '| stats sum(msg = "Circuit breaker opened") as circuitOpenEvents,',
        '  sum(msg = "Circuit breaker closed") as circuitCloseEvents,',
        '  sum(msg = "Admission denied" and reason = "circuit_open") as admissionDeniedCircuitOpen,',
        '  sum(msg = "Admission denied" and reason = "rate_limited") as admissionDeniedRateLimited,',
        '  sum(msg = "Attempting delivery") as deliveryAttempts,',
        '  sum(msg = "Delivery succeeded") as deliverySuccesses,',
        '  sum(msg in ["Transient delivery failure \u2014 requeuing", "Permanent delivery failure \u2014 sending to DLQ"]) as deliveryFailures,',
        '  sum(msg = "Rate limited (429)") as deliveryRateLimited',
      ].join("\n"),
    }),
  );

  if (!queryId) return null;

  return pollQueryResults(client, queryId, (row) => {
    const getField = (name: string): number =>
      Number(row.find((f) => f.field === name)?.value ?? 0);

    return {
      snapshotAt: Date.now(),
      intervalStartSec: startTimeSec,
      intervalEndSec: endTimeSec,
      circuitOpenEvents: getField("circuitOpenEvents"),
      circuitCloseEvents: getField("circuitCloseEvents"),
      admissionDeniedCircuitOpen: getField("admissionDeniedCircuitOpen"),
      admissionDeniedRateLimited: getField("admissionDeniedRateLimited"),
      deliveryAttempts: getField("deliveryAttempts"),
      deliverySuccesses: getField("deliverySuccesses"),
      deliveryFailures: getField("deliveryFailures"),
      deliveryRateLimited: getField("deliveryRateLimited"),
    };
  });
}

const RATE_TIMELINE_BIN_SECONDS = 10;

export async function queryPerClientRateTimeline(
  client: CloudWatchLogsClient,
  logGroupName: string,
  startTimeSec: number,
  endTimeSec: number,
): Promise<PerClientRateEntry[]> {
  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        'filter msg in ["Attempting delivery", "Admission denied"]',
        `| stats sum(msg = "Attempting delivery") as deliveryAttempts by bin(@timestamp, ${RATE_TIMELINE_BIN_SECONDS}s) as timeBin`,
        "| sort timeBin asc",
      ].join("\n"),
    }),
  );

  if (!queryId) return [];

  return pollAllQueryResults(client, queryId, (row) => {
    const timeBinStr = row.find((f) => f.field === "timeBin")?.value ?? "0";
    const timestampSec = Math.floor(new Date(timeBinStr).getTime() / 1000);
    const deliveryAttempts = Number(
      row.find((f) => f.field === "deliveryAttempts")?.value ?? 0,
    );

    return { timestampSec, deliveryAttempts };
  });
}
