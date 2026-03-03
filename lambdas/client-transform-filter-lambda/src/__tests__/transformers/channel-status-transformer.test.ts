import { transformChannelStatus } from "services/transformers/channel-status-transformer";
import type {
  Channel,
  ChannelStatus,
  ChannelStatusAttributes,
  ChannelStatusData,
  ClientCallbackPayload,
  StatusPublishEvent,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";

describe("channel-status-transformer", () => {
  describe("transformChannelStatus", () => {
    const channelStatusEvent: StatusPublishEvent<ChannelStatusData> = {
      specversion: "1.0",
      id: "SOME-GUID-a123-556677889999",
      source:
        "/nhs/england/notify/development/primary/data-plane/client-callbacks",
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

    it("should extract messageId from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.messageId).toBe("msg-789-xyz");
      expect(attrs.messageReference).toBe("client-ref-12345");
    });

    it("should extract channel from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channel).toBe("nhsapp");
    });

    it("should extract channelStatus from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channelStatus).toBe("delivered");
    });

    it("should extract supplierStatus from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.supplierStatus).toBe("delivered");
    });

    it("should extract cascadeType from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.cascadeType).toBe("primary");
    });

    it("should extract cascadeOrder from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.cascadeOrder).toBe(1);
    });

    it("should extract timestamp from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.timestamp).toBe("2026-02-05T14:29:55Z");
    });

    it("should extract retryCount from notify-data", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.retryCount).toBe(0);
    });

    it("should include channelStatusDescription if present", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channelStatusDescription).toBe(
        "Successfully delivered to NHS App",
      );
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

    it("should exclude channelFailureReasonCode if not present", () => {
      const result = transformChannelStatus(channelStatusEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channelFailureReasonCode).toBeUndefined();
    });

    it("should handle previousChannelStatus for transition tracking", () => {
      const eventWithPrevious = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          previousChannelStatus: "SENDING" as ChannelStatus,
        },
      };

      const result = transformChannelStatus(eventWithPrevious);

      // previousChannelStatus should be excluded from callback payload (operational field)
      expect(
        (result.data[0].attributes as any).previousChannelStatus,
      ).toBeUndefined();
    });

    it("should handle previousSupplierStatus for transition tracking", () => {
      const eventWithPrevious = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          previousSupplierStatus: "RECEIVED" as SupplierStatus,
        },
      };

      const result = transformChannelStatus(eventWithPrevious);

      // previousSupplierStatus should be excluded from callback payload (operational field)
      expect(
        (result.data[0].attributes as any).previousSupplierStatus,
      ).toBeUndefined();
    });

    it("should construct message link using messageId", () => {
      const result = transformChannelStatus(channelStatusEvent);

      expect(result.data[0].links.message).toBe(
        "/v1/message-batches/messages/msg-789-xyz",
      );
    });

    it("should include idempotencyKey from event id in meta", () => {
      const result = transformChannelStatus(channelStatusEvent);

      expect(result.data[0].meta.idempotencyKey).toBe(
        "SOME-GUID-a123-556677889999",
      );
    });

    it("should exclude operational fields (clientId) from callback payload", () => {
      const result = transformChannelStatus(channelStatusEvent);

      // Verify that clientId is not in the payload
      expect((result.data[0].attributes as any).clientId).toBeUndefined();
    });

    it("should set type as 'ChannelStatus' in data array", () => {
      const result = transformChannelStatus(channelStatusEvent);

      expect(result.data[0].type).toBe("ChannelStatus");
    });

    it("should handle retryCount > 0", () => {
      const eventWithRetries = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          retryCount: 3,
        },
      };

      const result = transformChannelStatus(eventWithRetries);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.retryCount).toBe(3);
    });

    it("should handle cascadeOrder for fallback channels", () => {
      const fallbackEvent = {
        ...channelStatusEvent,
        data: {
          ...channelStatusEvent.data,
          channel: "SMS" as Channel,
          cascadeType: "secondary" as "primary" | "secondary",
          cascadeOrder: 2,
        },
      };

      const result = transformChannelStatus(fallbackEvent);
      const attrs = result.data[0].attributes as ChannelStatusAttributes;

      expect(attrs.channel).toBe("sms");
      expect(attrs.cascadeType).toBe("secondary");
      expect(attrs.cascadeOrder).toBe(2);
    });
  });
});
