import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SQSClient } from "@aws-sdk/client-sqs";
import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

import {
  type SignedCallback,
  awaitSignedCallbacksFromWebhookLogGroup,
} from "./cloudwatch";
import { ensureInboundQueueIsEmpty, sendSqsEvent } from "./sqs";

async function processStatusEvent<
  T extends MessageStatusData | ChannelStatusData,
>(
  {
    CloudWatchLogsClient: cloudWatchClient,
    SQSClient: sqsClient,
  }: { CloudWatchLogsClient: CloudWatchLogsClient; SQSClient: SQSClient },
  callbackEventQueueUrl: string,
  webhookLogGroupName: string,
  event: StatusPublishEvent<T>,
  callbackType: SignedCallback["payload"]["type"],
  webhookPath: string,
  startTime: number,
): Promise<SignedCallback[]> {
  const sendMessageResponse = await sendSqsEvent(
    sqsClient,
    callbackEventQueueUrl,
    event,
  );

  if (!sendMessageResponse.MessageId) {
    throw new Error("Expected SQS send response to include MessageId");
  }

  await ensureInboundQueueIsEmpty(sqsClient, callbackEventQueueUrl);

  return awaitSignedCallbacksFromWebhookLogGroup(
    cloudWatchClient,
    webhookLogGroupName,
    event.data.messageId,
    callbackType,
    startTime,
    webhookPath,
  );
}

export async function processMessageStatusEvent(
  sqsClient: SQSClient,
  cloudWatchClient: CloudWatchLogsClient,
  callbackEventQueueUrl: string,
  webhookLogGroupName: string,
  messageStatusEvent: StatusPublishEvent<MessageStatusData>,
  webhookPath: string,
  startTime: number,
): Promise<SignedCallback[]> {
  return processStatusEvent(
    { CloudWatchLogsClient: cloudWatchClient, SQSClient: sqsClient },
    callbackEventQueueUrl,
    webhookLogGroupName,
    messageStatusEvent,
    "MessageStatus",
    webhookPath,
    startTime,
  );
}

export async function processChannelStatusEvent(
  sqsClient: SQSClient,
  cloudWatchClient: CloudWatchLogsClient,
  callbackEventQueueUrl: string,
  webhookLogGroupName: string,
  channelStatusEvent: StatusPublishEvent<ChannelStatusData>,
  webhookPath: string,
  startTime: number,
): Promise<SignedCallback[]> {
  return processStatusEvent(
    { CloudWatchLogsClient: cloudWatchClient, SQSClient: sqsClient },
    callbackEventQueueUrl,
    webhookLogGroupName,
    channelStatusEvent,
    "ChannelStatus",
    webhookPath,
    startTime,
  );
}
