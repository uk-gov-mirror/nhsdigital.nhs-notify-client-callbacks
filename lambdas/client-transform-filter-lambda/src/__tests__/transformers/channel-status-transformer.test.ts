import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import type {
  ChannelStatus,
  ChannelStatusAttributes,
  ChannelStatusData,
  ClientCallbackPayload,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

describe("channel-status-transformer", () => {
  describe("transformChannelStatus", () => {
    const channelStatusEvent: StatusPublishEvent<ChannelStatusData> = {
      specversion: "1.0",
      id: "SOME-GUID-a123-556677889999",
      source: "/nhs/england/notify/development/primary/data-plane/messaging",
      subject:
        "customer/920fca11-596a-4eca-9c47-99f624614658/message/msg-456-abc/channel/nhsapp",
      type: "uk.nhs.notify.channel.status.PUBLISHED.v1",
      time: "2026-02-05T14:30:00.000Z",
      datacontenttype: "application/json",
      dataschema:
        "https://notify.nhs.uk/schemas/channel-status-published-v1.json",
      traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-02",
      data: {
        clientId: "client-abc-123",
        messageId: "msg-789-xyz",
        messageReference: "client-ref-12345",
        channel: "NHSAPP",
        channelStatus: "DELIVERED",
        channelStatusDescription: "Successfully delivered to NHS App",
        supplierStatus: "delivered",
        cascadeType: "primary",
        cascadeOrder: 1,
        timestamp: "2026-02-05T14:29:55Z",
        retryCount: 0,
      },
    };

    it("should transform channel status event to JSON:API callback payload", () => {
      const result: ClientCallbackPayload =
        transformChannelStatus(channelStatusEvent);

      expect(result).toEqual({
        data: [
          {
            type: "ChannelStatus",
            attributes: {
              messageId: "msg-789-xyz",
              messageReference: "client-ref-12345",
              channel: "nhsapp",
              channelStatus: "delivered",
              channelStatusDescription: "Successfully delivered to NHS App",
              supplierStatus: "delivered",
              cascadeType: "primary",
              cascadeOrder: 1,
              timestamp: "2026-02-05T14:29:55Z",
              retryCount: 0,
            },
            links: {
              message: "/v1/message-batches/messages/msg-789-xyz",
            },
            meta: {
              idempotencyKey: "SOME-GUID-a123-556677889999",
            },
          },
        ],
      });
    });

    it("should exclude channelStatusDescription if not present", () => {
      const eventWithoutDescription = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          channelStatusDescription: undefined,
        },
      };

      const result = transformChannelStatus(eventWithoutDescription);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channelStatusDescription).toBeUndefined();
    });

    it("should include channelFailureReasonCode if present", () => {
      const eventWithFailure = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          channelStatus: "FAILED" as ChannelStatus,
          channelFailureReasonCode: "RECIPIENT_INVALID",
        },
      };

      const result = transformChannelStatus(eventWithFailure);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channelFailureReasonCode).toBe("RECIPIENT_INVALID");
    });
  });
});
