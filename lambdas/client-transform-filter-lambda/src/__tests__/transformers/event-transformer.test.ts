import {
  type ChannelStatusData,
  type MessageStatusData,
  type StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { TransformationError } from "services/error-handler";
import { transformEvent } from "services/transformers/event-transformer";

const baseEvent = {
  specversion: "1.0",
  source: "/nhs/england/notify/development/primary/data-plane/messaging",
  subject: "customer/client-abc-123/message/msg-789-xyz",
  time: "2026-02-05T14:30:00.000Z",
  datacontenttype: "application/json",
  traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
};

const messageStatusEvent: StatusPublishEvent<MessageStatusData> = {
  ...baseEvent,
  id: "msg-event-id-001",
  dataschema: "https://notify.nhs.uk/schemas/message-status-published-v1.json",
  type: "uk.nhs.notify.message.status.PUBLISHED.v1",
  data: {
    clientId: "client-abc-123",
    messageId: "msg-789-xyz",
    messageReference: "client-ref-12345",
    messageStatus: "DELIVERED",
    channels: [{ type: "NHSAPP", channelStatus: "DELIVERED" }],
    timestamp: "2026-02-05T14:29:55Z",
    routingPlan: {
      id: "routing-plan-123",
      name: "NHS App",
      version: "v1",
      createdDate: "2023-11-17T14:27:51.413Z",
    },
  },
};

const channelStatusEvent: StatusPublishEvent<ChannelStatusData> = {
  ...baseEvent,
  id: "ch-event-id-001",
  dataschema: "https://notify.nhs.uk/schemas/channel-status-published-v1.json",
  type: "uk.nhs.notify.channel.status.PUBLISHED.v1",
  data: {
    clientId: "client-abc-123",
    messageId: "msg-789-xyz",
    messageReference: "client-ref-12345",
    channel: "NHSAPP",
    channelStatus: "DELIVERED",
    supplierStatus: "delivered",
    cascadeType: "primary",
    cascadeOrder: 1,
    retryCount: 0,
    timestamp: "2026-02-05T14:29:55Z",
  },
};

describe("event-transformer", () => {
  describe("transformEvent", () => {
    it("transforms a message status event", () => {
      const result = transformEvent(
        messageStatusEvent,
        "corr-id-001",
        "https://api.example.com",
      );

      expect(result.data[0].type).toBe("MessageStatus");
    });

    it("transforms a channel status event", () => {
      const result = transformEvent(
        channelStatusEvent,
        "corr-id-002",
        "https://api.example.com",
      );

      expect(result.data[0].type).toBe("ChannelStatus");
    });

    it("throws TransformationError for unsupported event type", () => {
      const unsupportedEvent = {
        ...messageStatusEvent,
        type: "uk.nhs.notify.unsupported.event.v1",
      } as unknown as StatusPublishEvent;

      expect(() =>
        transformEvent(
          unsupportedEvent,
          "corr-id-003",
          "https://api.example.com",
        ),
      ).toThrow(TransformationError);

      expect(() =>
        transformEvent(
          unsupportedEvent,
          "corr-id-003",
          "https://api.example.com",
        ),
      ).toThrow("Unsupported event type: uk.nhs.notify.unsupported.event.v1");
    });

    it("includes correlationId in TransformationError when provided", () => {
      const unsupportedEvent = {
        ...messageStatusEvent,
        type: "uk.nhs.notify.unknown.v1",
      } as unknown as StatusPublishEvent;

      let caughtError: unknown;
      try {
        transformEvent(
          unsupportedEvent,
          "test-correlation-id",
          "https://api.example.com",
        );
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(TransformationError);
      expect((caughtError as TransformationError).message).toBe(
        "Unsupported event type: uk.nhs.notify.unknown.v1",
      );
    });
  });
});
