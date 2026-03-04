import { validateStatusPublishEvent } from "services/validators/event-validator";
import type {
  ChannelStatusData,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

type TestEvent<T> = Omit<StatusPublishEvent<T>, "traceparent"> & {
  traceparent?: string;
};

describe("event-validator", () => {
  describe("validateStatusPublishEvent", () => {
    const validMessageStatusEvent: TestEvent<MessageStatusData> = {
      specversion: "1.0",
      id: "661f9510-f39c-52e5-b827-557766551111",
      source: "/nhs/england/notify/development/primary/data-plane/messaging",
      subject:
        "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-789-xyz",
      type: "uk.nhs.notify.message.status.PUBLISHED.v1",
      time: "2026-02-05T14:30:00.000Z",
      datacontenttype: "application/json",
      dataschema:
        "https://notify.nhs.uk/schemas/message-status-published-v1.json",
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
        validateStatusPublishEvent(validMessageStatusEvent),
      ).not.toThrow();
    });

    describe("NHS Notify extension attributes validation", () => {
      it("should throw error if traceparent is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        delete invalidEvent.traceparent;

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: traceparent: Invalid input: expected string, received undefined",
        );
      });
    });

    describe("event type namespace validation", () => {
      it("should throw error if type doesn't match namespace", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          type: "uk.nhs.notify.wrong.namespace.v1",
        };

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          'Validation failed: type: Invalid option: expected one of "uk.nhs.notify.message.status.PUBLISHED.v1"|"uk.nhs.notify.channel.status.PUBLISHED.v1"',
        );
      });
    });

    describe("datacontenttype validation", () => {
      it("should throw error if datacontenttype is not 'application/json'", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          datacontenttype: "text/plain",
        };

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          'Validation failed: datacontenttype: Invalid input: expected "application/json"',
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: clientId: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: messageId: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: timestamp: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: messageStatus: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: channels: Invalid input: expected array, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: channels.0.type: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: channels.0.channelStatus: Invalid input: expected string, received undefined",
        );
      });
    });

    describe("channel status specific validation", () => {
      const validChannelStatusEvent: TestEvent<ChannelStatusData> = {
        ...validMessageStatusEvent,
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
          timestamp: "2026-02-05T14:29:55Z",
          retryCount: 0,
        },
      };

      it("should validate a valid channel status event", () => {
        expect(() =>
          validateStatusPublishEvent(validChannelStatusEvent),
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: channel: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: channelStatus: Invalid input: expected string, received undefined",
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

        expect(() => validateStatusPublishEvent(invalidEvent)).toThrow(
          "Validation failed: supplierStatus: Invalid input: expected string, received undefined",
        );
      });
    });

    describe("error handling edge paths", () => {
      it("should wrap CloudEvent constructor validation errors", () => {
        expect(() =>
          validateStatusPublishEvent({ specversion: "1.0" }),
        ).toThrow("CloudEvents validation failed:");
      });

      it("should format unknown non-Error exceptions during validation", () => {
        jest.resetModules();

        jest.isolateModules(() => {
          const nonErrorThrown = { foo: "bar" } as unknown as Error;

          jest.doMock("cloudevents", () => ({
            CloudEvent: jest.fn(() => {
              throw nonErrorThrown;
            }),
            ValidationError: Error,
          }));

          const moduleUnderTest = jest.requireActual(
            "services/validators/event-validator",
          );

          expect(() =>
            moduleUnderTest.validateStatusPublishEvent({
              specversion: "1.0",
            }),
          ).toThrow('Validation failed: {"foo":"bar"}');
        });

        jest.unmock("cloudevents");
      });
    });
  });
});
