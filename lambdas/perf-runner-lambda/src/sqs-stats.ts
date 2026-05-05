import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { QueueDepthSample } from "types";

export async function getQueueDepths(
  client: SQSClient,
  queueUrls: string[],
): Promise<QueueDepthSample> {
  const queues = await Promise.all(
    queueUrls.map(async (url) => {
      const response = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: url,
          AttributeNames: [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
          ],
        }),
      );
      const attrs = response.Attributes ?? {};
      return {
        queueUrl: url,
        visible: Number(attrs.ApproximateNumberOfMessages ?? "0"),
        notVisible: Number(attrs.ApproximateNumberOfMessagesNotVisible ?? "0"),
      };
    }),
  );

  return { timestampMs: Date.now(), queues };
}
