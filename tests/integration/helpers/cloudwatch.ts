import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { logger } from "@nhs-notify-client-callbacks/logger";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";
import { TimeoutError, waitUntil } from "async-wait-until";

const CALLBACK_WAIT_TIMEOUT_MS = 60_000;
const METRICS_WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2000;

type LogEntry = {
  msg: string;
  correlationId?: string;
  callbackType?: string;
  clientId?: string;
  signature?: string;
  payload?: string;
};

export type SignedCallback = {
  payload: CallbackItem;
  headers: { "x-hmac-sha256-signature": string };
};

async function querySignedCallbacksFromWebhookLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageId: string,
  callbackType: CallbackItem["type"],
  startTime: number,
): Promise<SignedCallback[]> {
  const filterPattern = `{ $.msg = "Callback received" && $.messageId = "${messageId}" && $.callbackType = "${callbackType}" }`;

  const response = await client.send(
    new FilterLogEventsCommand({
      logGroupName,
      startTime,
      filterPattern,
    }),
  );

  const events = response.events ?? [];
  const callbacks: SignedCallback[] = [];

  for (const event of events) {
    if (event.message) {
      try {
        const entry = JSON.parse(event.message) as LogEntry;
        if (entry.signature !== undefined && entry.payload) {
          callbacks.push({
            payload: JSON.parse(entry.payload) as CallbackItem,
            headers: { "x-hmac-sha256-signature": entry.signature },
          });
        }
      } catch {
        // skip unparseable entries
      }
    }
  }

  return callbacks;
}

async function pollUntilFound<T>(
  poll: () => Promise<T[]>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T[]> {
  let results: T[] = [];

  try {
    await waitUntil(
      async () => {
        results = await poll();
        return results.length > 0;
      },
      { timeout: timeoutMs, intervalBetweenAttempts: POLL_INTERVAL_MS },
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn(timeoutMessage);
    } else {
      throw error;
    }
  }

  return results;
}

export async function awaitSignedCallbacksFromWebhookLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageId: string,
  callbackType: CallbackItem["type"],
  startTime: number,
): Promise<SignedCallback[]> {
  logger.debug(
    `Waiting for callback in webhook CloudWatch log group (messageId=${messageId}, logGroup=${logGroupName})`,
  );

  return pollUntilFound(
    () =>
      querySignedCallbacksFromWebhookLogGroup(
        client,
        logGroupName,
        messageId,
        callbackType,
        startTime,
      ),
    CALLBACK_WAIT_TIMEOUT_MS,
    `Timed out waiting for callback in webhook CloudWatch log group (messageId=${messageId}, callbackType=${callbackType}, timeoutMs=${CALLBACK_WAIT_TIMEOUT_MS})`,
  );
}

type EmfEntry = Record<string, unknown>;

function collectMetricNamesFromEvent(
  message: string,
  metricNames: string[],
  found: Set<string>,
): void {
  try {
    const entry = JSON.parse(message) as EmfEntry;
    if (entry._aws) {
      for (const name of metricNames) {
        if (name in entry) found.add(name);
      }
    }
  } catch {
    // skip unparseable entries
  }
}

async function queryEmfMetricsFromLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  metricNames: string[],
  startTime: number,
): Promise<Set<string>> {
  const conditions = metricNames.map((name) => `$.${name} > 0`).join(" || ");
  const filterPattern = `{ ${conditions} }`;

  const response = await client.send(
    new FilterLogEventsCommand({
      logGroupName,
      startTime,
      filterPattern,
    }),
  );

  const found = new Set<string>();
  for (const event of response.events ?? []) {
    if (event.message) {
      collectMetricNamesFromEvent(event.message, metricNames, found);
    }
  }
  return found;
}

export async function awaitAllEmfMetricsInLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  metricNames: string[],
  startTime: number,
): Promise<void> {
  logger.debug(
    `Waiting for EMF metrics in CloudWatch log group (metrics=${metricNames.join(",")}, logGroup=${logGroupName})`,
  );

  await waitUntil(
    async () => {
      const found = await queryEmfMetricsFromLogGroup(
        client,
        logGroupName,
        metricNames,
        startTime,
      );
      return metricNames.every((name) => found.has(name));
    },
    {
      timeout: METRICS_WAIT_TIMEOUT_MS,
      intervalBetweenAttempts: POLL_INTERVAL_MS,
    },
  );
}
