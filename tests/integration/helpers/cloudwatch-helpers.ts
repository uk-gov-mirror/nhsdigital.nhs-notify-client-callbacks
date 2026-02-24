import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { CallbackPayload } from "nhs-notify-mock-webhook-lambda/src/types";

const client = new CloudWatchLogsClient({ region: "eu-west-2" });

/**
 * Query CloudWatch Logs for mock webhook callbacks
 *
 * @param logGroupName - CloudWatch log group name for the mock webhook lambda
 * @param pattern - Filter pattern (e.g., messageId)
 * @param startTime - Optional start time for log search (defaults to 5 minutes ago)
 * @returns Array of log entries containing callback payloads
 */
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

/**
 * Parse callback payloads from CloudWatch log messages
 *
 * Extracts the JSON payload from log messages with format:
 * "CALLBACK {messageId} {messageType} : {JSON payload}"
 *
 * @param logs - Array of log entries from CloudWatch
 * @returns Array of parsed callback payloads
 */
export function parseCallbacksFromLogs(logs: unknown[]): CallbackPayload[] {
  return logs
    .map((log: unknown) => {
      if (
        typeof log === "object" &&
        log !== null &&
        "msg" in log &&
        typeof log.msg === "string"
      ) {
        // Extract JSON from "CALLBACK {id} {type} : {json}" format
        const match = /CALLBACK .+ : (.+)$/.exec(log.msg);
        if (match?.[1]) {
          try {
            return JSON.parse(match[1]) as CallbackPayload;
          } catch {
            return null;
          }
        }
      }
      return null;
    })
    .filter((payload): payload is CallbackPayload => payload !== null);
}

/**
 * Get message status callbacks for a specific message ID
 *
 * @param logGroupName - CloudWatch log group name
 * @param requestItemId - Message ID to filter by
 * @param startTime - Optional start time for search
 * @returns Array of MessageStatus callback payloads
 */
export async function getMessageStatusCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackPayload[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    `%${requestItemId}%MessageStatus%`,
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}

/**
 * Get channel status callbacks for a specific message ID
 *
 * @param logGroupName - CloudWatch log group name
 * @param requestItemId - Message ID to filter by
 * @param startTime - Optional start time for search
 * @returns Array of ChannelStatus callback payloads
 */
export async function getChannelStatusCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackPayload[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    `%${requestItemId}%ChannelStatus%`,
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}

/**
 * Get all callbacks for a specific message ID
 *
 * @param logGroupName - CloudWatch log group name
 * @param requestItemId - Message ID to filter by
 * @param startTime - Optional start time for search
 * @returns Array of all callback payloads (MessageStatus and ChannelStatus)
 */
export async function getAllCallbacks(
  logGroupName: string,
  requestItemId: string,
  startTime?: Date,
): Promise<CallbackPayload[]> {
  const logs = await getCallbackLogsFromCloudWatch(
    logGroupName,
    `"${requestItemId}"`,
    startTime,
  );
  return parseCallbacksFromLogs(logs);
}
