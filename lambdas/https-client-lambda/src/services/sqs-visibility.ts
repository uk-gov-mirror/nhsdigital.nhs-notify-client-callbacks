import { ChangeMessageVisibilityCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});

export async function changeVisibility(
  receiptHandle: string,
  visibilityTimeoutSeconds: number,
): Promise<void> {
  const { QUEUE_URL } = process.env;
  if (!QUEUE_URL) {
    throw new Error("QUEUE_URL is required");
  }

  await sqsClient.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: Math.floor(visibilityTimeoutSeconds),
    }),
  );
}
