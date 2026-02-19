/* eslint-disable sonarjs/no-nested-functions */
import { validateStatusTransitionEvent } from "services/validators/event-validator";
import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type { ChannelStatusData } from "models/channel-status-data";

// Make traceparent optional for tests that need to delete it
type TestEvent<T> = Omit<StatusTransitionEvent<T>, "traceparent"> & {
  traceparent?: string;
};

describe("event-validator", () => {
  describe("validateStatusTransitionEvent", () => {
    const validMessageStatusEvent: TestEvent<MessageStatusData> = {
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

    it("should validate a valid message status event", () => {
      expect(() =>
        validateStatusTransitionEvent(validMessageStatusEvent),
      ).not.toThrow();
    });

    describe("NHS Notify extension attributes validation", () => {
      it("should throw error if traceparent is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        delete invalidEvent.traceparent;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: traceparent: Required",
        );
      });
    });

    describe("event type namespace validation", () => {
      it("should throw error if type doesn't match namespace", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          type: "uk.nhs.notify.wrong.namespace.v1",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: type: Invalid enum value",
        );
      });
    });

    describe("datacontenttype validation", () => {
      it("should throw error if datacontenttype is not 'application/json'", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          datacontenttype: "text/plain",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          'Validation failed: datacontenttype: Invalid literal value, expected "application/json"',
        );
      });
    });

    describe("data required fields validation", () => {
      it("should throw error if data.clientId is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            clientId: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: clientId: Required",
        );
      });

      it("should throw error if data.messageId is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            messageId: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: messageId: Required",
        );
      });

      it("should throw error if data.timestamp is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            timestamp: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: timestamp: Required",
        );
      });

      it("should throw error if data.timestamp is not valid RFC 3339 format", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            timestamp: "2026-02-05",
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data.timestamp must be a valid RFC 3339 timestamp",
        );
      });
    });

    describe("message status specific validation", () => {
      it("should throw error if messageStatus is missing for message status event", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            messageStatus: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: messageStatus: Required",
        );
      });

      it("should throw error if channels array is missing for message status event", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            channels: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: channels: Required",
        );
      });

      it("should throw error if channels array is empty", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            channels: [],
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data.channels must have at least one channel",
        );
      });

      it("should throw error if channel.type is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            channels: [{ channelStatus: "delivered" } as any],
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: channels.0.type: Required",
        );
      });

      it("should throw error if channel.channelStatus is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            ...validMessageStatusEvent.data,
            channels: [{ type: "nhsapp" } as any],
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: channels.0.channelStatus: Required",
        );
      });
    });

    describe("channel status specific validation", () => {
      const validChannelStatusEvent: TestEvent<ChannelStatusData> = {
        ...validMessageStatusEvent,
        type: "uk.nhs.notify.client-callbacks.channel.status.transitioned.v1",
        data: {
          clientId: "client-abc-123",
          messageId: "msg-789-xyz",
          messageReference: "client-ref-12345",
          channel: "NHSAPP",
          channelStatus: "DELIVERED",
          supplierStatus: "DELIVERED",
          cascadeType: "primary",
          cascadeOrder: 1,
          timestamp: "2026-02-05T14:29:55Z",
          retryCount: 0,
        },
      };

      it("should validate a valid channel status event", () => {
        expect(() =>
          validateStatusTransitionEvent(validChannelStatusEvent),
        ).not.toThrow();
      });

      it("should throw error if channel is missing for channel status event", () => {
        const invalidEvent = {
          ...validChannelStatusEvent,
          data: {
            ...validChannelStatusEvent.data,
            channel: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: channel: Required",
        );
      });

      it("should throw error if channelStatus is missing for channel status event", () => {
        const invalidEvent = {
          ...validChannelStatusEvent,
          data: {
            ...validChannelStatusEvent.data,
            channelStatus: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: channelStatus: Required",
        );
      });

      it("should throw error if supplierStatus is missing for channel status event", () => {
        const invalidEvent = {
          ...validChannelStatusEvent,
          data: {
            ...validChannelStatusEvent.data,
            supplierStatus: undefined,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "Validation failed: supplierStatus: Required",
        );
      });
    });
  });
});
