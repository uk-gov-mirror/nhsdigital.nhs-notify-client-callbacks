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
  sqsClient: SQSClient,
  cloudWatchClient: CloudWatchLogsClient,
  callbackEventQueueUrl: string,
  webhookLogGroupName: string,
  event: StatusPublishEvent<T>,
  callbackType: SignedCallback["payload"]["type"],
  webhookPath: string,
): Promise<SignedCallback[]> {
  const startTime = Date.now();
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
): Promise<SignedCallback[]> {
  return processStatusEvent(
    sqsClient,
    cloudWatchClient,
    callbackEventQueueUrl,
    webhookLogGroupName,
    messageStatusEvent,
    "MessageStatus",
    webhookPath,
  );
}

export async function processChannelStatusEvent(
  sqsClient: SQSClient,
  cloudWatchClient: CloudWatchLogsClient,
  callbackEventQueueUrl: string,
  webhookLogGroupName: string,
  channelStatusEvent: StatusPublishEvent<ChannelStatusData>,
  webhookPath: string,
): Promise<SignedCallback[]> {
  return processStatusEvent(
    sqsClient,
    cloudWatchClient,
    callbackEventQueueUrl,
    webhookLogGroupName,
    channelStatusEvent,
    "ChannelStatus",
    webhookPath,
  );
}
