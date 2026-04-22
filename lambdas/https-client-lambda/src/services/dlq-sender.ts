import {
  type MessageAttributeValue,
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});

export type DlqErrorInfo = {
  statusCode?: number;
  errorCode?: string;
  responseBody?: string;
};

function buildDlqAttributes(
  errorInfo: DlqErrorInfo,
): Record<string, MessageAttributeValue> {
  const attrs: Record<string, MessageAttributeValue> = {};

  if (errorInfo.errorCode) {
    attrs.ERROR_CODE = {
      DataType: "String",
      StringValue: errorInfo.errorCode,
    };
  } else if (errorInfo.statusCode !== undefined) {
    attrs.ERROR_CODE = {
      DataType: "String",
      StringValue: "HTTP_CLIENT_ERROR",
    };
  }

  if (errorInfo.responseBody) {
    let errorMessage = errorInfo.responseBody;
    try {
      const parsed = JSON.parse(errorInfo.responseBody) as {
        message?: string;
      };
      if (parsed.message) {
        errorMessage = parsed.message;
      }
    } catch {
      // use raw body if not valid JSON
    }
    attrs.ERROR_MESSAGE = { DataType: "String", StringValue: errorMessage };
  }

  return attrs;
}

export async function sendToDlq(
  messageBody: string,
  errorInfo?: DlqErrorInfo,
): Promise<void> {
  const { DLQ_URL } = process.env;
  if (!DLQ_URL) {
    throw new Error("DLQ_URL is required");
  }

  const messageAttributes = errorInfo
    ? buildDlqAttributes(errorInfo)
    : undefined;

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: DLQ_URL,
      MessageBody: messageBody,
      ...(messageAttributes && { MessageAttributes: messageAttributes }),
    }),
  );
}
