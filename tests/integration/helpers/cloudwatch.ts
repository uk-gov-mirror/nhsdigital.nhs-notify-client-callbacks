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
const CLOUDWATCH_QUERY_LOOKBACK_MS = Number(
  process.env.CLOUDWATCH_QUERY_LOOKBACK_MS ?? 5000,
);

type LogEntry = {
  msg: string;
  correlationId?: string;
  callbackType?: string;
  clientId?: string;
  apiKey?: string;
  signature?: string;
  payload?: string;
  path?: string;
  isMtls?: boolean;
};

export type SignedCallback = {
  payload: CallbackItem;
  path: string;
  isMtls: boolean;
  headers: {
    "x-api-key": string;
    "x-hmac-sha256-signature": string;
  };
};

async function querySignedCallbacksFromWebhookLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageId: string,
  callbackType: CallbackItem["type"],
  startTime: number,
): Promise<SignedCallback[]> {
  const filterPattern = `{ $.msg = "Callback received" && $.messageId = "${messageId}" && $.callbackType = "${callbackType}" }`;
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);

  const response = await client.send(
    new FilterLogEventsCommand({
      logGroupName,
      startTime: queryStartTime,
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
            path: entry.path ?? "",
            isMtls: entry.isMtls ?? false,
            headers: {
              "x-api-key": entry.apiKey ?? "",
              "x-hmac-sha256-signature": entry.signature,
            },
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
  path: string,
): Promise<SignedCallback[]> {
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);
  logger.debug(
    `Waiting for callback in webhook CloudWatch log group (messageId=${messageId}, path=${path}, logGroup=${logGroupName}, startTimeIso=${new Date(startTime).toISOString()}, queryStartTimeIso=${new Date(queryStartTime).toISOString()}, lookbackMs=${CLOUDWATCH_QUERY_LOOKBACK_MS})`,
  );

  const callbacks = await pollUntilFound(
    () =>
      querySignedCallbacksFromWebhookLogGroup(
        client,
        logGroupName,
        messageId,
        callbackType,
        startTime,
      ),
    CALLBACK_WAIT_TIMEOUT_MS,
    `Timed out waiting for callback in webhook CloudWatch log group (messageId=${messageId}, callbackType=${callbackType}, path=${path}, timeoutMs=${CALLBACK_WAIT_TIMEOUT_MS})`,
  );

  if (callbacks.length !== 1) {
    throw new Error(
      `Expected exactly 1 callback for messageId="${messageId}" callbackType="${callbackType}", but found ${callbacks.length}`,
    );
  }

  if (callbacks[0].path !== path) {
    throw new Error(
      `Expected callback path "${path}" for messageId="${messageId}", but got "${callbacks[0].path}"`,
    );
  }

  return callbacks;
}

export async function awaitSignedCallbacksByCountFromWebhookLogGroup(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageIds: string | string[],
  callbackType: CallbackItem["type"],
  expectedCountPerMessage: number,
  startTime: number,
): Promise<SignedCallback[]> {
  const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
  const messageIdSet = new Set(ids);
  const expectedTotal = ids.length * expectedCountPerMessage;
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);
  const filterPattern = `{ $.msg = "Callback received" && $.callbackType = "${callbackType}" }`;

  logger.debug(
    `Waiting for ${expectedTotal} callbacks in webhook CloudWatch log group (callbackType=${callbackType}, messageCount=${ids.length}, logGroup=${logGroupName})`,
  );

  let matched: SignedCallback[] = [];

  try {
    await waitUntil(
      async () => {
        const response = await client.send(
          new FilterLogEventsCommand({
            logGroupName,
            startTime: queryStartTime,
            filterPattern,
          }),
        );

        matched = (response.events ?? []).flatMap((event) => {
          if (!event.message) return [];
          try {
            const entry = JSON.parse(event.message) as LogEntry & {
              messageId?: string;
            };
            if (
              !entry.messageId ||
              !messageIdSet.has(entry.messageId) ||
              entry.signature === undefined ||
              !entry.payload
            )
              return [];

            return [
              {
                payload: JSON.parse(entry.payload) as CallbackItem,
                path: entry.path ?? "",
                isMtls: entry.isMtls ?? false,
                headers: {
                  "x-api-key": entry.apiKey ?? "",
                  "x-hmac-sha256-signature": entry.signature,
                },
              },
            ];
          } catch {
            return [];
          }
        });

        return matched.length >= expectedTotal;
      },
      {
        timeout: CALLBACK_WAIT_TIMEOUT_MS,
        intervalBetweenAttempts: POLL_INTERVAL_MS,
      },
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn(
        `Timed out waiting for callbacks (expected=${expectedTotal}, found=${matched.length}, callbackType=${callbackType}, timeoutMs=${CALLBACK_WAIT_TIMEOUT_MS})`,
      );
    } else {
      throw error;
    }
  }

  if (matched.length !== expectedTotal) {
    throw new Error(
      `Expected ${expectedTotal} callbacks for callbackType="${callbackType}", but found ${matched.length}`,
    );
  }

  return matched;
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
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);
  const conditions = metricNames.map((name) => `$.${name} > 0`).join(" || ");
  const filterPattern = `{ ${conditions} }`;

  const response = await client.send(
    new FilterLogEventsCommand({
      logGroupName,
      startTime: queryStartTime,
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
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);
  const queryStartTimeIso = new Date(queryStartTime).toISOString();
  const startTimeIso = new Date(startTime).toISOString();
  logger.debug(
    `Waiting for EMF metrics in CloudWatch log group (metrics=${metricNames.join(",")}, logGroup=${logGroupName}, startTimeIso=${startTimeIso}, queryStartTimeIso=${queryStartTimeIso}, lookbackMs=${CLOUDWATCH_QUERY_LOOKBACK_MS})`,
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

export async function countForcedStatusInvocations(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageId: string,
  startTime: number,
  minCount: number,
): Promise<number> {
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);
  const filterPattern = `{ $.msg = "Forced status code response" && $.messageId = "${messageId}" }`;

  const query = async () => {
    const response = await client.send(
      new FilterLogEventsCommand({
        logGroupName,
        startTime: queryStartTime,
        filterPattern,
      }),
    );
    return (response.events ?? []).length;
  };

  let count = 0;
  try {
    await waitUntil(
      async () => {
        count = await query();
        return count >= minCount;
      },
      {
        timeout: CALLBACK_WAIT_TIMEOUT_MS,
        intervalBetweenAttempts: POLL_INTERVAL_MS,
      },
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  return count;
}

export async function countLogEntries(
  client: CloudWatchLogsClient,
  logGroupName: string,
  filterPattern: string,
  startTime: number,
  minCount: number,
): Promise<number> {
  const queryStartTime = Math.max(0, startTime - CLOUDWATCH_QUERY_LOOKBACK_MS);

  let count = 0;
  try {
    await waitUntil(
      async () => {
        const response = await client.send(
          new FilterLogEventsCommand({
            logGroupName,
            startTime: queryStartTime,
            filterPattern,
          }),
        );
        count = (response.events ?? []).length;
        return count >= minCount;
      },
      {
        timeout: CALLBACK_WAIT_TIMEOUT_MS,
        intervalBetweenAttempts: POLL_INTERVAL_MS,
      },
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  return count;
}
