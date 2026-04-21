import {
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  type Message,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  type ReceiveMessageCommandInput,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { logger } from "@nhs-notify-client-callbacks/logger";
import type { DeploymentDetails } from "@nhs-notify-client-callbacks/test-support/helpers/deployment";
import { waitUntil } from "async-wait-until";

const QUEUE_WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const SQS_MAX_NUMBER_OF_MESSAGES = 1;
const SQS_VISIBILITY_TIMEOUT_SECONDS = 30;
const SQS_RECEIVE_WAIT_SECONDS = 5;

function buildReceiveMessageInput(
  queueUrl: string,
  waitTimeSeconds: number,
): ReceiveMessageCommandInput {
  return {
    QueueUrl: queueUrl,
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
    MaxNumberOfMessages: SQS_MAX_NUMBER_OF_MESSAGES,
    WaitTimeSeconds: waitTimeSeconds,
    VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
  };
}

function buildQueueUrl(
  { accountId, component, environment, project, region }: DeploymentDetails,
  name: string,
  options?: { appendQueueSuffix?: boolean },
): string {
  const appendQueueSuffix = options?.appendQueueSuffix ?? true;
  const queueName = appendQueueSuffix
    ? `${project}-${environment}-${component}-${name}-queue`
    : `${project}-${environment}-${component}-${name}`;
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

export function buildMockClientDlqQueueUrl(
  deploymentDetails: DeploymentDetails,
  clientId: string,
): string {
  return buildQueueUrl(deploymentDetails, `${clientId}-delivery-dlq`);
}

export function buildMockClientDeliveryQueueUrl(
  deploymentDetails: DeploymentDetails,
  clientId: string,
): string {
  return buildQueueUrl(deploymentDetails, `${clientId}-delivery`);
}

export async function sendSqsEvent<T>(
  client: SQSClient,
  queueUrl: string,
  event: T,
) {
  logger.info(
    `Sending SQS event to ${queueUrl} (eventId=${(event as any).id})`,
  );
  return client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    }),
  );
}

async function getQueueMessageCount(
  client: SQSClient,
  queueUrl?: string,
  attributeNames: (
    | "ApproximateNumberOfMessages"
    | "ApproximateNumberOfMessagesNotVisible"
  )[] = ["ApproximateNumberOfMessages"],
): Promise<number> {
  if (!queueUrl) {
    return 0;
  }

  const response = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: attributeNames,
    }),
  );

  const attrs = response.Attributes ?? {};
  return attributeNames.reduce(
    // eslint-disable-next-line security/detect-object-injection -- attr is a known enum value from the caller
    (sum, attr) => sum + Number(attrs[attr] ?? 0),
    0,
  );
}

export async function ensureInboundQueueIsEmpty(
  sqsClient: SQSClient,
  inboundEventQueueUrl: string,
): Promise<void> {
  logger.debug(
    `Waiting for inbound event queue to be empty (${inboundEventQueueUrl})`,
  );

  await waitUntil(
    async () => {
      const count = await getQueueMessageCount(
        sqsClient,
        inboundEventQueueUrl,
        [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
        ],
      );
      return count === 0;
    },
    QUEUE_WAIT_TIMEOUT_MS,
    250,
  );
}

export async function purgeQueue(
  client: SQSClient,
  queueUrl?: string,
): Promise<void> {
  if (!queueUrl) {
    return;
  }

  logger.debug(`Purging queue started (${queueUrl})`);

  try {
    await client.send(
      new PurgeQueueCommand({
        QueueUrl: queueUrl,
      }),
    );
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "PurgeQueueInProgress") {
      throw error;
    }
  }
}

export async function purgeQueues(
  client: SQSClient,
  queueUrls: (string | undefined)[],
): Promise<void> {
  await Promise.all(queueUrls.map((queueUrl) => purgeQueue(client, queueUrl)));
}

async function receiveOneMessage(client: SQSClient, queueUrl: string) {
  const response = await client.send(
    new ReceiveMessageCommand(
      buildReceiveMessageInput(queueUrl, SQS_RECEIVE_WAIT_SECONDS),
    ),
  );
  return response.Messages?.[0];
}

export async function awaitQueueMessage(
  client: SQSClient,
  queueUrl: string,
  timeoutMs: number = QUEUE_WAIT_TIMEOUT_MS,
): Promise<Message> {
  let message: Message | undefined;

  logger.debug(`Waiting for message in queue ${queueUrl}`);
  await waitUntil(
    async () => {
      message = await receiveOneMessage(client, queueUrl);
      return message !== undefined;
    },
    {
      intervalBetweenAttempts: POLL_INTERVAL_MS,
      timeout: timeoutMs,
    },
  );

  if (!message) {
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for a message to appear in ${queueUrl}`,
    );
  }

  return message;
}

export async function awaitQueueMessageByMessageId(
  client: SQSClient,
  queueUrl: string,
  expectedMessageId: string,
): Promise<Message> {
  let matchedMessage: Message | undefined;

  logger.debug(
    `Waiting for message with messageId=${expectedMessageId} in queue ${queueUrl}`,
  );
  await waitUntil(
    async () => {
      const response = await client.send(
        new ReceiveMessageCommand(
          buildReceiveMessageInput(queueUrl, SQS_RECEIVE_WAIT_SECONDS),
        ),
      );

      const messages = response.Messages ?? [];
      if (messages.length === 0) {
        return false;
      }

      for (const message of messages) {
        const body = message.Body ? JSON.parse(message.Body) : undefined;
        if (body?.data?.messageId === expectedMessageId) {
          matchedMessage = message;
          return true;
        }

        if (message.ReceiptHandle) {
          await client.send(
            new ChangeMessageVisibilityCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
              VisibilityTimeout: 0,
            }),
          );
        }
      }

      return false;
    },
    {
      intervalBetweenAttempts: POLL_INTERVAL_MS,
      timeout: QUEUE_WAIT_TIMEOUT_MS,
    },
  );

  if (!matchedMessage) {
    throw new Error(
      `Timed out after ${QUEUE_WAIT_TIMEOUT_MS}ms waiting for messageId=${expectedMessageId} in ${queueUrl}`,
    );
  }

  return matchedMessage;
}
