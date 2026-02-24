/* eslint-disable sonarjs/no-nested-functions */
import { validateStatusTransitionEvent } from "services/validators/event-validator";
import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";

describe("event-validator", () => {
  describe("validateStatusTransitionEvent", () => {
    const validMessageStatusEvent: StatusTransitionEvent<MessageStatusData> = {
      profileversion: "1.0.0",
      profilepublished: "2025-10",
      specversion: "1.0",
      id: "661f9510-f39c-52e5-b827-557766551111",
      source:
        "/nhs/england/notify/development/primary/data-plane/client-callbacks",
      subject:
        "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-789-xyz",
      type: "uk.nhs.notify.client-callbacks.message.status.transitioned.v1",
      time: "2026-02-05T14:30:00.000Z",
      recordedtime: "2026-02-05T14:30:00.150Z",
      datacontenttype: "application/json",
      dataschema: "https://nhs.uk/schemas/notify/message-status-data.v1.json",
      severitynumber: 2,
      severitytext: "INFO",
      traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
      data: {
        "notify-payload": {
          "notify-data": {
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
          "notify-metadata": {
            teamResponsible: "Team 1",
            notifyDomain: "Delivering",
            microservice: "core-event-publisher",
            repositoryUrl: "https://github.com/NHSDigital/comms-mgr",
            accountId: "123456789012",
            environment: "development",
            instance: "primary",
            microserviceInstanceId: "lambda-abc123",
            microserviceVersion: "1.0.0",
          },
        },
      },
    };

    it("should validate a valid message status event", () => {
      expect(() =>
        validateStatusTransitionEvent(validMessageStatusEvent),
      ).not.toThrow();
    });

    describe("NHS Notify extension attributes validation", () => {
      it("should throw error if profileversion is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.profileversion;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "profileversion is required",
        );
      });

      it("should throw error if profileversion is not '1.0.0'", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          profileversion: "2.0.0",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "profileversion must be '1.0.0'",
        );
      });

      it("should throw error if profilepublished is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.profilepublished;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "profilepublished is required",
        );
      });

      it("should throw error if profilepublished format is invalid", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          profilepublished: "2025",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "profilepublished must be in format YYYY-MM",
        );
      });

      it("should throw error if recordedtime is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.recordedtime;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "recordedtime is required",
        );
      });

      it("should throw error if recordedtime is not valid RFC 3339 format", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          recordedtime: "2026-02-05",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "recordedtime must be a valid RFC 3339 timestamp",
        );
      });

      it("should throw error if recordedtime is before time", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          time: "2026-02-05T14:30:00.000Z",
          recordedtime: "2026-02-05T14:29:00.000Z",
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "recordedtime must be >= time",
        );
      });

      it("should throw error if severitynumber is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.severitynumber;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "severitynumber is required",
        );
      });

      it("should throw error if severitytext is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.severitytext;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "severitytext is required",
        );
      });

      it("should throw error if traceparent is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.traceparent;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "traceparent is required",
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
          "type must match namespace uk.nhs.notify.client-callbacks.*",
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
          "datacontenttype must be 'application/json'",
        );
      });
    });

    describe("notify-payload wrapper validation", () => {
      it("should throw error if data is missing", () => {
        const invalidEvent = { ...validMessageStatusEvent };
        // @ts-expect-error - Testing invalid event
        delete invalidEvent.data;

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data is required",
        );
      });

      it("should throw error if notify-payload is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {} as any,
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data.notify-payload is required",
        );
      });

      it("should throw error if notify-data is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            } as any,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data.notify-payload.notify-data is required",
        );
      });

      it("should throw error if notify-metadata is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data":
                validMessageStatusEvent.data["notify-payload"]["notify-data"],
            } as any,
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "data.notify-payload.notify-metadata is required",
        );
      });
    });

    describe("notify-data required fields validation", () => {
      it("should throw error if notify-data.clientId is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                clientId: undefined,
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.clientId is required",
        );
      });

      it("should throw error if notify-data.messageId is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                messageId: undefined,
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.messageId is required",
        );
      });

      it("should throw error if notify-data.timestamp is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                timestamp: undefined,
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.timestamp is required",
        );
      });

      it("should throw error if notify-data.timestamp is not valid RFC 3339 format", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                timestamp: "2026-02-05",
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.timestamp must be a valid RFC 3339 timestamp",
        );
      });
    });

    describe("message status specific validation", () => {
      it("should throw error if messageStatus is missing for message status event", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                messageStatus: undefined,
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.messageStatus is required for message status events",
        );
      });

      it("should throw error if channels array is missing for message status event", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channels: undefined,
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channels is required for message status events",
        );
      });

      it("should throw error if channels array is empty", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channels: [],
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channels must have at least one channel",
        );
      });

      it("should throw error if channel.type is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channels: [{ channelStatus: "delivered" } as any],
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channels[0].type is required",
        );
      });

      it("should throw error if channel.channelStatus is missing", () => {
        const invalidEvent = {
          ...validMessageStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validMessageStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channels: [{ type: "nhsapp" } as any],
              },
              "notify-metadata":
                validMessageStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channels[0].channelStatus is required",
        );
      });
    });

    describe("channel status specific validation", () => {
      const validChannelStatusEvent: StatusTransitionEvent = {
        ...validMessageStatusEvent,
        type: "uk.nhs.notify.client-callbacks.channel.status.transitioned.v1",
        data: {
          "notify-payload": {
            "notify-data": {
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
              routingPlan: {
                id: "routing-plan-123",
                name: "NHS App with SMS fallback",
                version: "ztoe2qRAM8M8vS0bqajhyEBcvXacrGPp",
                createdDate: "2023-11-17T14:27:51.413Z",
              },
            },
            "notify-metadata":
              validMessageStatusEvent.data["notify-payload"]["notify-metadata"],
          },
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
            "notify-payload": {
              "notify-data": {
                ...validChannelStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channel: undefined,
              },
              "notify-metadata":
                validChannelStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channel is required for channel status events",
        );
      });

      it("should throw error if channelStatus is missing for channel status event", () => {
        const invalidEvent = {
          ...validChannelStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validChannelStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                channelStatus: undefined,
              },
              "notify-metadata":
                validChannelStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.channelStatus is required for channel status events",
        );
      });

      it("should throw error if supplierStatus is missing for channel status event", () => {
        const invalidEvent = {
          ...validChannelStatusEvent,
          data: {
            "notify-payload": {
              "notify-data": {
                ...validChannelStatusEvent.data["notify-payload"][
                  "notify-data"
                ],
                supplierStatus: undefined,
              },
              "notify-metadata":
                validChannelStatusEvent.data["notify-payload"][
                  "notify-metadata"
                ],
            },
          },
        };

        expect(() => validateStatusTransitionEvent(invalidEvent)).toThrow(
          "notify-data.supplierStatus is required for channel status events",
        );
      });
    });
  });
});
