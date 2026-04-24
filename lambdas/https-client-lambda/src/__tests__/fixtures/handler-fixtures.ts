import type { SQSRecord } from "aws-lambda";

export const DEFAULT_TARGET = {
  targetId: "target-1",
  type: "API" as const,
  invocationEndpoint: "https://webhook.example.invalid",
  invocationMethod: "POST" as const,
  invocationRateLimit: 10,
  apiKey: { headerName: "x-api-key", headerValue: "secret-key" },
  delivery: {
    mtls: { enabled: true },
  },
};

export const makeRecord = (overrides: Partial<SQSRecord> = {}): SQSRecord => ({
  messageId: "msg-1",
  receiptHandle: "receipt-1",
  body: JSON.stringify({
    payload: {
      data: [
        {
          type: "MessageStatus",
          attributes: {
            messageId: "test-message-id",
            messageStatus: "delivered",
          },
        },
      ],
    },
    subscriptionId: "sub-1",
    targetId: "target-1",
  }),
  attributes: {
    ApproximateReceiveCount: "1",
    SentTimestamp: "0",
    SenderId: "sender",
    ApproximateFirstReceiveTimestamp: "0",
  },
  messageAttributes: {},
  md5OfBody: "abc",
  eventSource: "aws:sqs",
  eventSourceARN: "arn:aws:sqs:eu-west-2:123:queue",
  awsRegion: "eu-west-2",
  ...overrides,
});
