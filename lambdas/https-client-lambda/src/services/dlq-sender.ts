import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});

export async function sendToDlq(messageBody: string): Promise<void> {
  const { DLQ_URL } = process.env;
  if (!DLQ_URL) {
    throw new Error("DLQ_URL is required");
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: DLQ_URL,
      MessageBody: messageBody,
    }),
  );
}
