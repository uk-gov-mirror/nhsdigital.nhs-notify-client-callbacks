import { transformMessageStatus } from "services/transformers/message-status-transformer";
import type { StatusTransitionEvent } from "models/status-transition-event";
import type { MessageStatusData } from "models/message-status-data";
import type {
  ClientCallbackPayload,
  MessageStatusAttributes,
} from "models/client-callback-payload";
import type { MessageStatus } from "models/status-types";

describe("message-status-transformer", () => {
  describe("transformMessageStatus", () => {
    const messageStatusEvent: StatusTransitionEvent<MessageStatusData> = {
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
              {
                type: "SMS",
                channelStatus: "SKIPPED",
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

    it("should transform message status event to JSON:API callback payload", () => {
      const result: ClientCallbackPayload =
        transformMessageStatus(messageStatusEvent);

      expect(result).toEqual({
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-789-xyz",
              messageReference: "client-ref-12345",
              messageStatus: "delivered",
              messageStatusDescription: "Message successfully delivered",
              channels: [
                {
                  type: "nhsapp",
                  channelStatus: "delivered",
                },
                {
                  type: "sms",
                  channelStatus: "skipped",
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
            links: {
              message: "/v1/message-batches/messages/msg-789-xyz",
            },
            meta: {
              idempotencyKey: "661f9510-f39c-52e5-b827-557766551111",
            },
          },
        ],
      });
    });

    it("should extract messageId from notify-data", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageId).toBe("msg-789-xyz");
      expect(attrs.messageReference).toBe("client-ref-12345");
    });

    it("should extract messageStatus from notify-data", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageStatus).toBe("delivered");
    });

    it("should extract channels array from notify-data", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.channels).toHaveLength(2);
      expect(attrs.channels[0]).toEqual({
        type: "nhsapp",
        channelStatus: "delivered",
      });
      expect(attrs.channels[1]).toEqual({
        type: "sms",
        channelStatus: "skipped",
      });
    });

    it("should extract timestamp from notify-data", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.timestamp).toBe("2026-02-05T14:29:55Z");
    });

    it("should construct routingPlan object from notify-data", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.routingPlan).toEqual({
        id: "routing-plan-123",
        name: "NHS App with SMS fallback",
        version: "ztoe2qRAM8M8vS0bqajhyEBcvXacrGPp",
        createdDate: "2023-11-17T14:27:51.413Z",
      });
    });

    it("should include messageStatusDescription if present", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageStatusDescription).toBe(
        "Message successfully delivered",
      );
    });

    it("should exclude messageStatusDescription if not present", () => {
      const eventWithoutDescription = {
        ...messageStatusEvent,
        data: {
          "notify-payload": {
            ...messageStatusEvent.data["notify-payload"],
            "notify-data": {
              ...messageStatusEvent.data["notify-payload"]["notify-data"],
              messageStatusDescription: undefined,
            },
          },
        },
      };

      const result = transformMessageStatus(eventWithoutDescription);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageStatusDescription).toBeUndefined();
    });

    it("should include messageFailureReasonCode if present", () => {
      const eventWithFailure = {
        ...messageStatusEvent,
        data: {
          "notify-payload": {
            ...messageStatusEvent.data["notify-payload"],
            "notify-data": {
              ...messageStatusEvent.data["notify-payload"]["notify-data"],
              messageStatus: "FAILED" as MessageStatus,
              messageFailureReasonCode: "DELIVERY_TIMEOUT",
            },
          },
        },
      };

      const result = transformMessageStatus(eventWithFailure);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageFailureReasonCode).toBe("DELIVERY_TIMEOUT");
    });

    it("should exclude messageFailureReasonCode if not present", () => {
      const result = transformMessageStatus(messageStatusEvent);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageFailureReasonCode).toBeUndefined();
    });

    it("should construct message link using messageId", () => {
      const result = transformMessageStatus(messageStatusEvent);

      expect(result.data[0].links.message).toBe(
        "/v1/message-batches/messages/msg-789-xyz",
      );
    });

    it("should include idempotencyKey from event id in meta", () => {
      const result = transformMessageStatus(messageStatusEvent);

      expect(result.data[0].meta.idempotencyKey).toBe(
        "661f9510-f39c-52e5-b827-557766551111",
      );
    });

    it("should exclude operational fields (clientId, previousMessageStatus) from callback payload", () => {
      const eventWithOperationalFields = {
        ...messageStatusEvent,
        data: {
          "notify-payload": {
            ...messageStatusEvent.data["notify-payload"],
            "notify-data": {
              ...messageStatusEvent.data["notify-payload"]["notify-data"],
              previousMessageStatus: "SENDING" as MessageStatus,
            },
          },
        },
      };

      const result = transformMessageStatus(eventWithOperationalFields);

      // Verify that clientId and previousMessageStatus are not in the payload
      expect((result.data[0].attributes as any).clientId).toBeUndefined();
      expect(
        (result.data[0].attributes as any).previousMessageStatus,
      ).toBeUndefined();
    });

    it("should set type as 'MessageStatus' in data array", () => {
      const result = transformMessageStatus(messageStatusEvent);

      expect(result.data[0].type).toBe("MessageStatus");
    });
  });
});
