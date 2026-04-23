import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { logger } from "@nhs-notify-client-callbacks/logger";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";
import { TimeoutError, waitUntil } from "async-wait-until";

const WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2000;
const LOOKBACK_MS = Number(process.env.CLOUDWATCH_QUERY_LOOKBACK_MS ?? 5000);

type LogEntry = {
  msg: string;
  messageId?: string;
  callbackType?: string;
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

// eslint-disable-next-line sonarjs/function-return-type -- returns SignedCallback | undefined consistently
function parseCallback(
  message: string,
  messageIdSet: Set<string>,
): SignedCallback | undefined {
  try {
    const entry = JSON.parse(message) as LogEntry;
    if (
      !entry.messageId ||
      !messageIdSet.has(entry.messageId) ||
      entry.signature === undefined ||
      !entry.payload
    )
      return undefined;

    return {
      payload: JSON.parse(entry.payload) as CallbackItem,
      path: entry.path ?? "",
      isMtls: entry.isMtls ?? false,
      headers: {
        "x-api-key": entry.apiKey ?? "",
        "x-hmac-sha256-signature": entry.signature,
      },
    };
  } catch {
    return undefined;
  }
}

export async function awaitCallbacks(
  client: CloudWatchLogsClient,
  logGroupName: string,
  messageIds: string | string[],
  callbackType: CallbackItem["type"],
  expectedPerMessage: number,
  startTime: number,
): Promise<SignedCallback[]> {
  const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
  const messageIdSet = new Set(ids);
  const expectedTotal = ids.length * expectedPerMessage;
  const queryStartTime = Math.max(0, startTime - LOOKBACK_MS);
  const filterPattern = `{ $.msg = "Callback received" && $.callbackType = "${callbackType}" }`;

  logger.debug(
    `Waiting for ${expectedTotal} callback(s) (type=${callbackType}, messages=${ids.length}, logGroup=${logGroupName})`,
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
          const cb = parseCallback(event.message, messageIdSet);
          return cb ? [cb] : [];
        });

        return matched.length >= expectedTotal;
      },
      { timeout: WAIT_TIMEOUT_MS, intervalBetweenAttempts: POLL_INTERVAL_MS },
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.warn(
        `Timed out waiting for callbacks (expected=${expectedTotal}, found=${matched.length})`,
      );
    } else {
      throw error;
    }
  }

  if (matched.length !== expectedTotal) {
    throw new Error(
      `Expected ${expectedTotal} callback(s) for type="${callbackType}", found ${matched.length}`,
    );
  }

  return matched;
}

export async function awaitEmfMetrics(
  client: CloudWatchLogsClient,
  logGroupName: string,
  metricNames: string[],
  startTime: number,
): Promise<void> {
  const queryStartTime = Math.max(0, startTime - LOOKBACK_MS);
  const conditions = metricNames.map((name) => `$.${name} > 0`).join(" || ");
  const filterPattern = `{ ${conditions} }`;

  logger.debug(
    `Waiting for EMF metrics [${metricNames.join(", ")}] in ${logGroupName}`,
  );

  await waitUntil(
    async () => {
      const response = await client.send(
        new FilterLogEventsCommand({
          logGroupName,
          startTime: queryStartTime,
          filterPattern,
        }),
      );

      const found = new Set<string>();
      for (const event of response.events ?? []) {
        if (!event.message) continue; // eslint-disable-line no-continue
        try {
          const entry = JSON.parse(event.message) as Record<string, unknown>;
          if (entry._aws) {
            for (const name of metricNames) {
              if (name in entry) found.add(name);
            }
          }
        } catch {
          // skip unparseable entries
        }
      }
      return metricNames.every((name) => found.has(name));
    },
    { timeout: WAIT_TIMEOUT_MS, intervalBetweenAttempts: POLL_INTERVAL_MS },
  );
}

export async function countLogEntries(
  client: CloudWatchLogsClient,
  logGroupName: string,
  filterPattern: string,
  startTime: number,
  minCount: number,
): Promise<number> {
  const queryStartTime = Math.max(0, startTime - LOOKBACK_MS);

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
      { timeout: WAIT_TIMEOUT_MS, intervalBetweenAttempts: POLL_INTERVAL_MS },
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) {
      throw error;
    }
  }

  return count;
}
