import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import { handler } from "..";

// Mock the metrics service to avoid actual CloudWatch calls
jest.mock("services/metrics", () => ({
  metricsService: {
    emitEventReceived: jest.fn().mockImplementation(async () => {}),
    emitTransformationSuccess: jest.fn().mockImplementation(async () => {}),
    emitDeliveryInitiated: jest.fn().mockImplementation(async () => {}),
    emitValidationError: jest.fn().mockImplementation(async () => {}),
    emitTransformationFailure: jest.fn().mockImplementation(async () => {}),
    emitProcessingLatency: jest.fn().mockImplementation(async () => {}),
  },
}));

describe("Lambda handler", () => {
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

  it("should transform a valid message status event", async () => {
    const result = await handler(validMessageStatusEvent);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("transformedPayload");
    expect(result[0].transformedPayload.data[0].type).toBe("MessageStatus");
    expect(result[0].transformedPayload.data[0].attributes.messageStatus).toBe(
      "delivered",
    );
  });

  it("should handle array of events", async () => {
    const events = [validMessageStatusEvent];
    const result = await handler(events);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("transformedPayload");
  });

  it("should handle stringified event", async () => {
    const eventStr = JSON.stringify(validMessageStatusEvent);
    const result = await handler(eventStr);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("transformedPayload");
  });

  it("should throw error for unsupported event type", async () => {
    const unsupportedEvent = {
      ...validMessageStatusEvent,
      type: "uk.nhs.notify.client-callbacks.unsupported.v1",
    };

    await expect(handler(unsupportedEvent)).rejects.toThrow(
      "Unsupported event type",
    );
  });
});
