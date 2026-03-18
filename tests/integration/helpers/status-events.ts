import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  CallbackItem,
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

import { awaitCallbacksFromBucketByKey } from "./callbacks";
import { ensureInboundQueueIsEmpty, sendSqsEvent } from "./sqs";

async function processStatusEvent<
  T extends MessageStatusData | ChannelStatusData,
>(
  sqsClient: SQSClient,
  s3Client: S3Client,
  callbackEventQueueUrl: string,
  debugLogBucketName: string,
  event: StatusPublishEvent<T>,
  callbackType: CallbackItem["type"],
): Promise<CallbackItem[]> {
  const sendMessageResponse = await sendSqsEvent(
    sqsClient,
    callbackEventQueueUrl,
    event,
  );

  if (!sendMessageResponse.MessageId) {
    throw new Error("Expected SQS send response to include MessageId");
  }

  await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

  const callbacks = await awaitCallbacksFromBucketByKey(
    s3Client,
    debugLogBucketName,
    event.id,
    callbackType,
  );

  return callbacks;
}

export async function processMessageStatusEvent(
  sqsClient: SQSClient,
  s3Client: S3Client,
  callbackEventQueueUrl: string,
  debugLogBucketName: string,
  messageStatusEvent: StatusPublishEvent<MessageStatusData>,
): Promise<CallbackItem[]> {
  return processStatusEvent(
    sqsClient,
    s3Client,
    callbackEventQueueUrl,
    debugLogBucketName,
    messageStatusEvent,
    "MessageStatus",
  );
}

export async function processChannelStatusEvent(
  sqsClient: SQSClient,
  s3Client: S3Client,
  callbackEventQueueUrl: string,
  debugLogBucketName: string,
  channelStatusEvent: StatusPublishEvent<ChannelStatusData>,
): Promise<CallbackItem[]> {
  return processStatusEvent(
    sqsClient,
    s3Client,
    callbackEventQueueUrl,
    debugLogBucketName,
    channelStatusEvent,
    "ChannelStatus",
  );
}
