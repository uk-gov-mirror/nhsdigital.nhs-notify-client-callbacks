import type { SQSRecord } from "aws-lambda";
import type { MetricsLogger } from "aws-embedded-metrics";
import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";
import type {
  ChannelStatusAttributes,
  MessageStatusAttributes,
} from "models/client-callback-payload";
import type { Logger } from "services/logger";
import type { CallbackMetrics } from "services/metrics";
import { ObservabilityService } from "services/observability";
import { createHandler } from "..";

describe("Lambda handler", () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  } as unknown as Logger;

  (mockLogger.child as jest.Mock).mockImplementation(() => mockLogger);

  const mockMetrics = {
    emitEventReceived: jest.fn(),
    emitTransformationSuccess: jest.fn(),
    emitTransformationFailure: jest.fn(),
    emitDeliveryInitiated: jest.fn(),
    emitValidationError: jest.fn(),
  } as unknown as CallbackMetrics;

  const mockMetricsLogger = {
    flush: jest.fn().mockImplementation(async () => {}),
  } as unknown as MetricsLogger;

  const handler = createHandler({
    createObservabilityService: () =>
      new ObservabilityService(mockLogger, mockMetrics, mockMetricsLogger),
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
      'Validation failed: type: Invalid option: expected one of "uk.nhs.notify.client-callbacks.message.status.transitioned.v1"|"uk.nhs.notify.client-callbacks.channel.status.transitioned.v1"',
    );
  });

  it("should transform a valid channel status event from SQS", async () => {
    const validChannelStatusEvent: StatusTransitionEvent<ChannelStatusData> = {
      specversion: "1.0",
      id: "channel-event-123",
      source:
        "/nhs/england/notify/development/primary/data-plane/client-callbacks",
      subject:
        "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-456-abc/channel/nhsapp",
      type: "uk.nhs.notify.client-callbacks.channel.status.transitioned.v1",
      time: "2026-02-05T14:30:00.000Z",
      datacontenttype: "application/json",
      dataschema: "https://nhs.uk/schemas/notify/channel-status-data.v1.json",
      traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-02",
      data: {
        clientId: "client-abc-123",
        messageId: "msg-789-xyz",
        messageReference: "client-ref-12345",
        channel: "NHSAPP",
        channelStatus: "DELIVERED",
        channelStatusDescription: "Successfully delivered to NHS App",
        supplierStatus: "DELIVERED",
        cascadeType: "primary",
        cascadeOrder: 1,
        timestamp: "2026-02-05T14:29:55Z",
        retryCount: 0,
      },
    };

    const sqsMessage: SQSRecord = {
      messageId: "sqs-channel-msg-id",
      receiptHandle: "receipt-handle-channel",
      body: JSON.stringify(validChannelStatusEvent),
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
    expect(dataItem.type).toBe("ChannelStatus");
    expect((dataItem.attributes as ChannelStatusAttributes).channelStatus).toBe(
      "delivered",
    );
    expect((dataItem.attributes as ChannelStatusAttributes).channel).toBe(
      "nhsapp",
    );
  });

  it("should throw error for invalid JSON in SQS message body", async () => {
    const sqsMessage: SQSRecord = {
      messageId: "sqs-msg-id-invalid",
      receiptHandle: "receipt-handle-invalid",
      body: "{ invalid json",
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
      "Failed to parse SQS message body as JSON",
    );
  });

  it("should handle validation errors and emit metrics", async () => {
    const invalidEvent = {
      ...validMessageStatusEvent,
      data: {
        ...validMessageStatusEvent.data,
        clientId: "",
      },
    };

    const sqsMessage: SQSRecord = {
      messageId: "sqs-msg-validation-error",
      receiptHandle: "receipt-handle-validation",
      body: JSON.stringify(invalidEvent),
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

    await expect(handler([sqsMessage])).rejects.toThrow("Validation failed");
  });

  it("should process empty batch successfully", async () => {
    const result = await handler([]);

    expect(result).toEqual([]);
  });

  it("should handle mixed message and channel status events in batch", async () => {
    const channelStatusEvent: StatusTransitionEvent<ChannelStatusData> = {
      specversion: "1.0",
      id: "channel-event-456",
      source:
        "/nhs/england/notify/development/primary/data-plane/client-callbacks",
      subject:
        "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-456-abc/channel/sms",
      type: "uk.nhs.notify.client-callbacks.channel.status.transitioned.v1",
      time: "2026-02-05T14:30:00.000Z",
      datacontenttype: "application/json",
      dataschema: "https://nhs.uk/schemas/notify/channel-status-data.v1.json",
      traceparent: "00-5e789078g07f464d08b1b42d2950c611-08g94cb69ee9eg81-02",
      data: {
        clientId: "client-xyz-789",
        messageId: "msg-456-abc",
        messageReference: "client-ref-67890",
        channel: "SMS",
        channelStatus: "FAILED",
        channelStatusDescription: "SMS delivery failed",
        channelFailureReasonCode: "SMS_001",
        supplierStatus: "PERMANENT_FAILURE",
        cascadeType: "secondary",
        cascadeOrder: 2,
        timestamp: "2026-02-05T14:30:00Z",
        retryCount: 1,
      },
    };

    const sqsMessages: SQSRecord[] = [
      {
        messageId: "sqs-msg-1",
        receiptHandle: "receipt-1",
        body: JSON.stringify(validMessageStatusEvent),
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1519211230",
          SenderId: "ABCDEFGHIJ",
          ApproximateFirstReceiveTimestamp: "1519211230",
        },
        messageAttributes: {},
        md5OfBody: "mock-md5-1",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
        awsRegion: "eu-west-2",
      },
      {
        messageId: "sqs-msg-2",
        receiptHandle: "receipt-2",
        body: JSON.stringify(channelStatusEvent),
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1519211231",
          SenderId: "ABCDEFGHIJ",
          ApproximateFirstReceiveTimestamp: "1519211231",
        },
        messageAttributes: {},
        md5OfBody: "mock-md5-2",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:mock-queue",
        awsRegion: "eu-west-2",
      },
    ];

    const result = await handler(sqsMessages);

    expect(result).toHaveLength(2);
    expect(result[0].transformedPayload.data[0].type).toBe("MessageStatus");
    expect(result[1].transformedPayload.data[0].type).toBe("ChannelStatus");
  });
});

describe("createHandler default wiring", () => {
  it("should construct default observability dependencies and delegate to processEvents", async () => {
    jest.resetModules();

    const state = {
      createMetricLogger: jest.fn(),
      CallbackMetrics: jest.fn(),
      LoggerCtor: jest.fn(),
      ObservabilityServiceCtor: jest.fn(),
      processEvents: jest.fn(),
      mockMetricsLogger: {
        flush: jest.fn().mockImplementation(async () => {}),
      },
      mockMetricsInstance: { emitEventReceived: jest.fn() },
      mockLoggerInstance: { info: jest.fn(), child: jest.fn() },
      mockObservabilityInstance: {
        flush: jest.fn().mockImplementation(async () => {}),
      },
      testHandler: undefined as
        | ((event: SQSRecord[]) => Promise<unknown>)
        | undefined,
    };

    jest.isolateModules(() => {
      state.createMetricLogger.mockReturnValue(state.mockMetricsLogger);
      state.CallbackMetrics.mockReturnValue(state.mockMetricsInstance);
      state.LoggerCtor.mockReturnValue(state.mockLoggerInstance);
      state.ObservabilityServiceCtor.mockReturnValue(
        state.mockObservabilityInstance,
      );
      state.processEvents.mockResolvedValue(["ok"]);

      jest.doMock("services/metrics", () => ({
        createMetricLogger: state.createMetricLogger,
        CallbackMetrics: state.CallbackMetrics,
      }));

      jest.doMock("services/logger", () => ({
        Logger: state.LoggerCtor,
      }));

      jest.doMock("services/observability", () => ({
        ObservabilityService: state.ObservabilityServiceCtor,
      }));

      jest.doMock("handler", () => ({
        processEvents: state.processEvents,
      }));

      const moduleUnderTest = jest.requireActual("..");
      state.testHandler = moduleUnderTest.createHandler();
    });

    expect(state.testHandler).toBeDefined();
    const result = await state.testHandler!([]);

    expect(state.createMetricLogger).toHaveBeenCalledTimes(1);
    expect(state.CallbackMetrics).toHaveBeenCalledWith(state.mockMetricsLogger);
    expect(state.LoggerCtor).toHaveBeenCalledTimes(1);
    expect(state.ObservabilityServiceCtor).toHaveBeenCalledWith(
      state.mockLoggerInstance,
      state.mockMetricsInstance,
      state.mockMetricsLogger,
    );
    expect(state.processEvents).toHaveBeenCalledWith(
      [],
      state.mockObservabilityInstance,
    );
    expect(result).toEqual(["ok"]);

    jest.unmock("services/metrics");
    jest.unmock("services/logger");
    jest.unmock("services/observability");
    jest.unmock("handler");
  });
});
