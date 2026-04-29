import {
  type CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { WebhookVerificationResult } from "types";

const INSIGHTS_POLL_INTERVAL_MS = 2000;
const INSIGHTS_TIMEOUT_MS = 30_000;

export async function verifyMockWebhook(
  client: CloudWatchLogsClient,
  logGroupName: string,
  startTimeSec: number,
  endTimeSec: number,
): Promise<WebhookVerificationResult> {
  const { queryId } = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: startTimeSec,
      endTime: endTimeSec,
      queryString: [
        'filter msg = "Callback received"',
        "| stats count(*) as callbackCount",
      ].join("\n"),
    }),
  );

  if (!queryId) {
    return { receivedCallbacks: 0, verified: false };
  }

  const deadline = Date.now() + INSIGHTS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, INSIGHTS_POLL_INTERVAL_MS);
    });

    const response = await client.send(new GetQueryResultsCommand({ queryId }));

    if (response.status === "Failed" || response.status === "Cancelled") {
      return { receivedCallbacks: 0, verified: false };
    }

    if (response.status === "Complete") {
      const rows =
        (response.results as { field?: string; value?: string }[][]) ?? [];
      const row = rows[0] ?? [];
      const count = Number(
        row.find((f) => f.field === "callbackCount")?.value ?? 0,
      );

      return { receivedCallbacks: count, verified: count > 0 };
    }
  }

  return { receivedCallbacks: 0, verified: false };
}
