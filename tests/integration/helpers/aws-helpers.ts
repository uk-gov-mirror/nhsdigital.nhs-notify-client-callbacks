import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  GetQueueAttributesCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import type { CallbackItem } from "@nhs-notify-client-callbacks/models";
import { waitUntil } from "async-wait-until";

export type DeploymentDetails = {
  region: string;
  environment: string;
  project: string;
  component: string;
  accountId: string;
};

/**
 * Reads deployment context from environment variables
 *
 * Requires: AWS_REGION, ENVIRONMENT, PROJECT, COMPONENT, AWS_ACCOUNT_ID
 */
export function getDeploymentDetails(): DeploymentDetails {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  const environment = process.env.ENVIRONMENT;
  const project = process.env.PROJECT;
  const component = process.env.COMPONENT;
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!environment) {
    throw new Error("ENVIRONMENT environment variable must be set");
  }
  if (!project) {
    throw new Error("PROJECT environment variable must be set");
  }
  if (!component) {
    throw new Error("COMPONENT environment variable must be set");
  }
  if (!accountId) {
    throw new Error("AWS_ACCOUNT_ID environment variable must be set");
  }

  return { region, environment, project, component, accountId };
}

/**
 * Builds the subscription config S3 bucket name from deployment details.
 */
export function buildSubscriptionConfigBucketName({
  accountId,
  component,
  environment,
  project,
  region,
}: DeploymentDetails): string {
  return `${project}-${accountId}-${region}-${environment}-${component}-subscription-config`;
}

/**
 * Creates an S3 client configured for the given region.
 */
export function createS3Client(): S3Client {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  return new S3Client({ region });
}

/**
 * Creates an SQS client configured for the given region.
 */
export function createSqsClient(): SQSClient {
  const region = process.env.AWS_REGION ?? "eu-west-2";
  return new SQSClient({ region });
}

/**
 * Builds the SQS queue URL from deployment details and queue name suffix.
 */
export function buildQueueUrl(
  { accountId, component, environment, project, region }: DeploymentDetails,
  name: string,
): string {
  const queueName = `${project}-${environment}-${component}-${name}-queue`;
  return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
}

/**
 * Builds the inbound event SQS queue URL from deployment details.
 */
export function buildInboundEventQueueUrl(
  deploymentDetails: DeploymentDetails,
): string {
  return buildQueueUrl(deploymentDetails, "inbound-event");
}

/**
 * Discovers all per-client DLQ URLs for the given deployment.
 */
export async function listClientDlqUrls(
  client: SQSClient,
  { component, environment, project }: DeploymentDetails,
): Promise<string[]> {
  const csi = `${project}-${environment}-${component}`;

  const response = await client.send(
    new ListQueuesCommand({
      QueueNamePrefix: csi,
      MaxResults: 100,
    }),
  );

  return (response.QueueUrls ?? []).filter(
    (url) => url.endsWith("-dlq-queue") && !url.includes("inbound-event"),
  );
}

/**
 * Builds the CloudWatch log group name for the mock webhook Lambda.
 */
export function buildMockWebhookLogGroupName({
  component,
  environment,
  project,
}: DeploymentDetails): string {
  return `/aws/lambda/${project}-${environment}-${component}-mock-webhook`;
}

/**
 * Sends a JSON-serialised event to an SQS queue.
 */
export async function sendSqsEvent<T>(
  client: SQSClient,
  queueUrl: string,
  event: T,
) {
  return client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    }),
  );
}

/**
 * Returns the approximate number of messages in the given SQS queue.
 * Returns 0 if queueUrl is undefined.
 */
export async function getQueueMessageCount(
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

/**
 * Waits until the given SQS queue is empty, polling until all visible messages
 * are processed or the timeout is exceeded.
 */
export async function awaitQueueEmpty(
  client: SQSClient,
  queueUrl?: string,
  attributeNames: (
    | "ApproximateNumberOfMessages"
    | "ApproximateNumberOfMessagesNotVisible"
  )[] = ["ApproximateNumberOfMessages"],
  timeoutMs = 10_000,
): Promise<void> {
  if (!queueUrl) {
    return;
  }

  const queueLabel = queueUrl.split("/").pop() ?? queueUrl;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const count = await getQueueMessageCount(client, queueUrl, attributeNames);

    if (count === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for queue to empty: ${queueLabel}`,
  );
}

/**
 * Receives a single message from the given SQS queue.
 * Returns undefined if no message is available within the visibility window.
 */
export async function receiveOneMessage(client: SQSClient, queueUrl: string) {
  const response = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
      VisibilityTimeout: 30,
    }),
  );
  return response.Messages?.[0];
}

/**
 * Waits for a message to appear in the given SQS queue, polling until a message
 * is received or the timeout is exceeded.
 */
export async function awaitQueueMessage(
  client: SQSClient,
  queueUrl: string,
  timeoutMs = 30_000,
) {
  let message: Awaited<ReturnType<typeof receiveOneMessage>>;

  await waitUntil(
    async () => {
      message = await receiveOneMessage(client, queueUrl);
      return message !== undefined;
    },
    {
      intervalBetweenAttempts: 500,
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

/**
 * Builds the S3 debug log bucket name from deployment details.
 */
export function buildDebugLogBucketName({
  accountId,
  component,
  environment,
  project,
  region,
}: DeploymentDetails): string {
  return `${project}-${accountId}-${region}-${environment}-${component}-debug-log`;
}

type DebugLogEntry = {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
};

async function listDebugLogEntries(
  client: S3Client,
  bucketName: string,
): Promise<DebugLogEntry[]> {
  const listResponse = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName }),
  );

  const keys = (listResponse.Contents ?? [])
    .map((obj) => obj.Key)
    .filter((key): key is string => key !== undefined);

  const entries = await Promise.all(
    keys.map(async (key) => {
      const obj = await client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
      );
      const body = await obj.Body?.transformToString();
      if (!body) return null;
      try {
        return JSON.parse(body) as DebugLogEntry;
      } catch {
        return null;
      }
    }),
  );

  return entries.filter((entry): entry is DebugLogEntry => entry !== null);
}

function parseCallbackFromMessage(message: string): CallbackItem | null {
  const match = /CALLBACK .+ : (.+)$/.exec(message);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as CallbackItem;
  } catch {
    return null;
  }
}

/**
 * Constructs a CallbackItem from a "Callback generated" structured log entry.
 * These entries come from client-transform-filter-lambda and store callback
 * fields as structured JSON properties rather than embedded in the message.
 */
function buildCallbackItemFromGeneratedEntry(
  entry: DebugLogEntry,
): CallbackItem {
  return {
    type: entry.callbackType as "MessageStatus" | "ChannelStatus",
    attributes: {
      messageId: entry.messageId as string,
      messageReference: entry.messageReference as string,
      ...(entry.callbackType === "MessageStatus"
        ? {
            messageStatus: entry.messageStatus,
            messageStatusDescription: entry.messageStatusDescription,
            channels: entry.channels,
            timestamp: entry.timestamp,
            routingPlan: entry.routingPlan ?? {},
          }
        : {
            channel: entry.channel,
            channelStatus: entry.channelStatus,
            channelStatusDescription: entry.channelStatusDescription,
            supplierStatus: entry.supplierStatus,
            cascadeType: entry.cascadeType,
            cascadeOrder: entry.cascadeOrder,
            timestamp: entry.timestamp,
            retryCount: entry.retryCount ?? 0,
          }),
    } as unknown as CallbackItem["attributes"],
    links: { message: entry.messageId as string },
    meta: { idempotencyKey: (entry.correlationId as string) ?? "" },
  };
}

async function getCallbacksFromBucket(
  client: S3Client,
  bucketName: string,
  callbackType: "MessageStatus" | "ChannelStatus",
  messageId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  const entries = await listDebugLogEntries(client, bucketName);

  return entries
    .filter((entry) => {
      if (startTime && new Date(entry.timestamp) < startTime) {
        return false;
      }
      // CALLBACK entries from mock-webhook-lambda: messageId is embedded in the
      // serialised JSON within the message string.
      if (
        entry.message.startsWith("CALLBACK") &&
        entry.message.includes(callbackType)
      ) {
        return entry.message.includes(messageId);
      }
      // "Callback generated" entries from client-transform-filter-lambda:
      // messageId is a top-level structured field, not part of the message.
      if (entry.message === "Callback generated") {
        return (
          entry.callbackType === callbackType &&
          (entry.messageId as string) === messageId
        );
      }
      return false;
    })
    .map((entry): CallbackItem | null => {
      if (entry.message.startsWith("CALLBACK")) {
        return parseCallbackFromMessage(entry.message);
      }
      return buildCallbackItemFromGeneratedEntry(entry);
    })
    .filter((item): item is CallbackItem => item !== null);
}

/**
 * Reads MessageStatus callback entries from the S3 debug log bucket.
 *
 * Handles two entry types:
 * - "CALLBACK ... MessageStatus : <JSON>" entries from mock-webhook-lambda
 *   (full CallbackItem payload already serialised in the message)
 * - "Callback generated" entries from client-transform-filter-lambda
 *   (messageId and callbackType stored as structured fields, not in message)
 */
export async function getMessageStatusCallbacksFromBucket(
  client: S3Client,
  bucketName: string,
  messageId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  return getCallbacksFromBucket(
    client,
    bucketName,
    "MessageStatus",
    messageId,
    startTime,
  );
}

/**
 * Reads ChannelStatus callback entries from the S3 debug log bucket.
 *
 * Handles the same two entry types as getMessageStatusCallbacksFromBucket,
 * filtered for ChannelStatus callbacks.
 */
export async function getChannelStatusCallbacksFromBucket(
  client: S3Client,
  bucketName: string,
  messageId: string,
  startTime?: Date,
): Promise<CallbackItem[]> {
  return getCallbacksFromBucket(
    client,
    bucketName,
    "ChannelStatus",
    messageId,
    startTime,
  );
}

/**
 * Deletes all debug log entries for the given test run from the S3 bucket.
 */
export async function deleteDebugLogEntries(
  client: S3Client,
  bucketName: string,
): Promise<void> {
  const listResponse = await client.send(
    new ListObjectsV2Command({ Bucket: bucketName }),
  );

  const objects = listResponse.Contents ?? [];
  if (objects.length === 0) return;

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objects.map((obj) => ({ Key: obj.Key! })),
        Quiet: true,
      },
    }),
  );
}
