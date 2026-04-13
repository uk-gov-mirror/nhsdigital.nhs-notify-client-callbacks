import { logger } from "@nhs-notify-client-callbacks/logger";
import {
  DeleteMessageCommand,
  type Message,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { awaitQueueMessageByMessageId, sendSqsEvent } from "./sqs";

export default async function sendEventToDlqAndRedrive<
  T extends { data: { messageId: string } },
>(
  sqsClient: SQSClient,
  dlqQueueUrl: string,
  inboundQueueUrl: string,
  event: T,
): Promise<{ dlqMessage: Message; payload: T }> {
  await sendSqsEvent(sqsClient, dlqQueueUrl, event);

  logger.debug(`Awaiting DLQ message by messageId (${event.data.messageId})`);
  const dlqMessage = await awaitQueueMessageByMessageId(
    sqsClient,
    dlqQueueUrl,
    event.data.messageId,
  );

  if (!dlqMessage.Body) {
    throw new Error("Expected DLQ message body to be defined");
  }

  const payload = JSON.parse(dlqMessage.Body) as T;
  await sendSqsEvent(sqsClient, inboundQueueUrl, payload);

  if (!dlqMessage.ReceiptHandle) {
    throw new Error("Expected DLQ message receipt handle to be defined");
  }

  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: dlqQueueUrl,
      ReceiptHandle: dlqMessage.ReceiptHandle,
    }),
  );

  return { dlqMessage, payload };
}
