import type { SQSRecord } from "aws-lambda";
import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { MessageStatusAttributes } from "models/client-callback-payload";
import { handler } from "..";

// Mock console.log to avoid EMF output during tests
const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

describe("Lambda handler", () => {
  beforeEach(() => {
    consoleLogSpy.mockClear();
  });

  const validMessageStatusEvent: StatusTransitionEvent<MessageStatusData> = {
    specversion: "1.0",
    id: "661f9510-f39c-52e5-b827-557766551111",
    source:
      "/nhs/england/notify/development/primary/data-plane/client-callbacks",
    subject:
      "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-789-xyz",
    type: "uk.nhs.notify.client-callbacks.message.status.transitioned.v1",
    time: "2026-02-05T14:30:00.000Z",
    datacontenttype: "application/json",
    dataschema: "https://nhs.uk/schemas/notify/message-status-data.v1.json",
    traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
    data: {
      clientId: "client-abc-123",
      messageId: "msg-789-xyz",
      messageReference: "client-ref-12345",
      messageStatus: "DELIVERED",
      messageStatusDescription: "Message successfully delivered",
      channels: [
        {
          type: "NHSAPP",
          channelStatus: "DELIVERED",
        },
      ],
      timestamp: "2026-02-05T14:29:55Z",
      routingPlan: {
        id: "routing-plan-123",
        name: "NHS App with SMS fallback",
        version: "ztoe2qRAM8M8vS0bqajhyEBcvXacrGPp",
        createdDate: "2023-11-17T14:27:51.413Z",
      },
    },
  };

  it("should transform a valid message status event from SQS", async () => {
    const sqsMessage: SQSRecord = {
      messageId: "sqs-msg-id-12345",
      receiptHandle: "receipt-handle-xyz",
      body: JSON.stringify(validMessageStatusEvent),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1519211230",
        SenderId: "ABCDEFGHIJ",
        ApproximateFirstReceiveTimestamp: "1519211230",
      },
      messageAttributes: {},
      md5OfBody: "mock-md5",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
      awsRegion: "eu-west-2",
    };

    const result = await handler([sqsMessage]);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("transformedPayload");
    const dataItem = result[0].transformedPayload.data[0];
    expect(dataItem.type).toBe("MessageStatus");
    expect((dataItem.attributes as MessageStatusAttributes).messageStatus).toBe(
      "delivered",
    );
  });

  it("should handle batch of SQS messages from EventBridge Pipes", async () => {
    const sqsMessages: SQSRecord[] = [
      {
        messageId: "sqs-msg-id-1",
        receiptHandle: "receipt-handle-1",
        body: JSON.stringify(validMessageStatusEvent),
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1519211230",
          SenderId: "ABCDEFGHIJ",
          ApproximateFirstReceiveTimestamp: "1519211230",
        },
        messageAttributes: {},
        md5OfBody: "mock-md5",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
        awsRegion: "eu-west-2",
      },
      {
        messageId: "sqs-msg-id-2",
        receiptHandle: "receipt-handle-2",
        body: JSON.stringify(validMessageStatusEvent),
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1519211230",
          SenderId: "ABCDEFGHIJ",
          ApproximateFirstReceiveTimestamp: "1519211230",
        },
        messageAttributes: {},
        md5OfBody: "mock-md5",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
        awsRegion: "eu-west-2",
      },
    ];

    const result = await handler(sqsMessages);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("transformedPayload");
    expect(result[1]).toHaveProperty("transformedPayload");
  });

  it("should throw error for unsupported event type", async () => {
    const unsupportedEvent = {
      ...validMessageStatusEvent,
      type: "uk.nhs.notify.client-callbacks.unsupported.v1",
    };

    const sqsMessage: SQSRecord = {
      messageId: "sqs-msg-id-error",
      receiptHandle: "receipt-handle-error",
      body: JSON.stringify(unsupportedEvent),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1519211230",
        SenderId: "ABCDEFGHIJ",
        ApproximateFirstReceiveTimestamp: "1519211230",
      },
      messageAttributes: {},
      md5OfBody: "mock-md5",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
      awsRegion: "eu-west-2",
    };

    await expect(handler([sqsMessage])).rejects.toThrow(
      "Validation failed: type: Invalid enum value",
    );
  });
});
