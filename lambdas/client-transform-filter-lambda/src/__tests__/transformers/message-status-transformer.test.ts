import { transformMessageStatus } from "services/transformers/message-status-transformer";
import type {
  ClientCallbackPayload,
  MessageStatus,
  MessageStatusAttributes,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

describe("message-status-transformer", () => {
  describe("transformMessageStatus", () => {
    const messageStatusEvent: StatusPublishEvent<MessageStatusData> = {
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

    it("should exclude messageStatusDescription if not present", () => {
      const eventWithoutDescription = {
        ...messageStatusEvent,
        data: {
          ...messageStatusEvent.data,
          messageStatusDescription: undefined,
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
          ...messageStatusEvent.data,
          messageStatus: "FAILED" as MessageStatus,
          messageFailureReasonCode: "DELIVERY_TIMEOUT",
        },
      };

      const result = transformMessageStatus(eventWithFailure);
      const attrs = result.data[0].attributes as MessageStatusAttributes;

      expect(attrs.messageFailureReasonCode).toBe("DELIVERY_TIMEOUT");
    });
  });
});
