import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { waitUntil } from "async-wait-until";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";

const client = new CloudWatchLogsClient({
  region: process.env.AWS_REGION ?? "eu-west-2",
});

export async function getCallbackLogsFromCloudWatch(
  logGroupName: string,
  terms: string[],
  startTime?: Date,
): Promise<unknown[]> {
  const searchStartTime = startTime ?? new Date(Date.now() - 5 * 60 * 1000);

  const filterClauses = terms
    .map((term) => `| filter @message like "${term}"`)
    .join(" ");
  const queryString = `fields @message ${filterClauses} | sort @timestamp desc | limit 100`;

  const startEpoch = Math.floor(searchStartTime.getTime() / 1000);
  const endEpoch = Math.floor(Date.now() / 1000) + 30;

  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: startEpoch,
      endTime: endEpoch,
      queryString,
    }),
  );

  if (!queryId) {
    return [];
  }

  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    const { results = [], status } = await client.send(
      new GetQueryResultsCommand({ queryId }),
    );

    if (status === "Complete") {
      const parsed = results
        .map((fields) => {
          const messageField = fields.find((f) => f.field === "@message");
          return messageField?.value
            ? (JSON.parse(messageField.value) as unknown)
            : null;
        })
        .filter((v): v is unknown => v !== null);
      return parsed;
    }

    if (status === "Failed" || status === "Cancelled" || status === "Timeout") {
      throw new Error(
        `CloudWatch Insights query ${status}: queryId=${queryId}`,
      );
    }
  }

  return [];
}

export function parseCallbacksFromLogs(logs: unknown[]): CallbackItem[] {
  return logs
    .map((log: unknown) => {
      if (
        typeof log === "object" &&
        log !== null &&
        "msg" in log &&
        typeof log.msg === "string"
      ) {
        const match = /CALLBACK .+ : (.+)$/.exec(log.msg);
        if (match?.[1]) {
          try {
            return JSON.parse(match[1]) as CallbackItem;
          } catch {
            return null;
          }
        }
      }
      return null;
    })
    .filter((payload): payload is CallbackItem => payload !== null);
}

export async function getMessageStatusCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    [requestItemId, "MessageStatus"],
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}

export async function getChannelStatusCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    [requestItemId, "ChannelStatus"],
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}

export async function getAllCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    [requestItemId],
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}

export const awaitChannelStatusCallbacks = async (
  logGroup: string,
  messageId: string,
) => {
  let callbacks: Awaited<ReturnType<typeof getChannelStatusCallbacks>> = [];

  await waitUntil(
    async () => {
      callbacks = await getChannelStatusCallbacks(logGroup, messageId);
      return callbacks.length > 0;
    },
    {
      intervalBetweenAttempts: 500,
      timeout: 10_000,
    },
  );

  if (callbacks.length === 0) {
    throw new Error("Timed out waiting for channel status callbacks");
  }

  return callbacks;
};

/**
 * Polls a callback getter function until it returns at least one result or the
 * timeout is exceeded. Throws if no results arrive within the timeout.
 *
 * @example
 * const callbacks = await awaitCallbacks(
 *   () => getMessageStatusCallbacks(logGroupName, messageId),
 *   10_000,
 * );
 */
export async function awaitCallbacks<T>(
  getter: () => Promise<T[]>,
  timeoutMs = 30_000,
  label?: string,
): Promise<T[]> {
  let results: T[] = [];

  await waitUntil(
    async () => {
      results = await getter();
      return results.length > 0;
    },
    {
      intervalBetweenAttempts: 500,
      timeout: timeoutMs,
    },
  );

  if (results.length === 0) {
    const labelSuffix = label ? ` (${label})` : "";
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for callbacks${labelSuffix}`,
    );
  }

  return results;
}
