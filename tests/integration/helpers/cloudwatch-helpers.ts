import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";

const client = new CloudWatchLogsClient({
  region: process.env.REGION ?? "eu-west-2",
});

export async function getCallbackLogsFromCloudWatch(
  logGroupName: string,
  pattern: string,
  startTime?: Date,
): Promise<unknown[]> {
  const searchStartTime = startTime || new Date(Date.now() - 5 * 60 * 1000);

  const filterEvents = new FilterLogEventsCommand({
    logGroupName,
    startTime: searchStartTime.getTime(),
    filterPattern: pattern,
    limit: 100,
  });

  const { events = [] } = await client.send(filterEvents);

  return events.flatMap(({ message }) =>
    message ? [JSON.parse(message)] : [],
  );
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
    `%${requestItemId}%MessageStatus%`,
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
    `%${requestItemId}%ChannelStatus%`,
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
    `"${requestItemId}"`,
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}
