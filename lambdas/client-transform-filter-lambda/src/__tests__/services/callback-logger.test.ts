import {
  logCallbackGenerated,
  logCallbackSigned,
} from "services/callback-logger";
import type { Logger } from "services/logger";
import {
  type ClientCallbackPayload,
  EventTypes,
} from "@nhs-notify-client-callbacks/models";

describe("callback-logger", () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(),
      addContext: jest.fn(),
      clearContext: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  describe("logCallbackGenerated", () => {
    describe("MESSAGE_STATUS_PUBLISHED events", () => {
      const messageStatusPayload: ClientCallbackPayload = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-123",
              messageReference: "ref-456",
              messageStatus: "delivered",
              messageStatusDescription: "Message successfully delivered",
              messageFailureReasonCode: undefined,
              channels: [
                {
                  type: "nhsapp",
                  channelStatus: "delivered",
                },
              ],
              timestamp: "2026-02-05T14:29:55Z",
              routingPlan: {
                id: "routing-plan-123",
                name: "NHS App with SMS fallback",
                version: "v1",
                createdDate: "2023-11-17T14:27:51.413Z",
              },
            },
            links: {
              message: "/v1/message-batches/messages/msg-123",
            },
            meta: {
              idempotencyKey: "661f9510-f39c-52e5-b827-557766551111",
            },
          },
        ],
      };

      it("should log message status callback with all fields", () => {
        logCallbackGenerated(
          mockLogger,
          messageStatusPayload,
          EventTypes.MESSAGE_STATUS_PUBLISHED,
          "corr-123",
          "client-abc",
        );

        expect(mockLogger.info).toHaveBeenCalledWith("Callback generated", {
          correlationId: "corr-123",
          callbackType: "MessageStatus",
          clientId: "client-abc",
          messageId: "msg-123",
          messageReference: "ref-456",
          messageStatus: "delivered",
          messageStatusDescription: "Message successfully delivered",
          messageFailureReasonCode: undefined,
          channels: [
            {
              type: "nhsapp",
              channelStatus: "delivered",
            },
          ],
        });
      });

      it("should log message status callback with failure reason code", () => {
        const failedPayload: ClientCallbackPayload = {
          data: [
            {
              ...messageStatusPayload.data[0],
              attributes: {
                ...messageStatusPayload.data[0].attributes,
                messageStatus: "failed",
                messageStatusDescription: "All channels failed",
                messageFailureReasonCode: "ERR_INVALID_RECIPIENT",
              },
            },
          ],
        };

        logCallbackGenerated(
          mockLogger,
          failedPayload,
          EventTypes.MESSAGE_STATUS_PUBLISHED,
          "corr-456",
          "client-xyz",
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          "Callback generated",
          expect.objectContaining({
            messageStatus: "failed",
            messageFailureReasonCode: "ERR_INVALID_RECIPIENT",
          }),
        );
      });

      it("should handle undefined correlationId", () => {
        logCallbackGenerated(
          mockLogger,
          messageStatusPayload,
          EventTypes.MESSAGE_STATUS_PUBLISHED,
          undefined,
          "client-abc",
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          "Callback generated",
          expect.objectContaining({
            correlationId: undefined,
          }),
        );
      });
    });

    describe("CHANNEL_STATUS_PUBLISHED events", () => {
      const channelStatusPayload: ClientCallbackPayload = {
        data: [
          {
            type: "ChannelStatus",
            attributes: {
              messageId: "msg-456",
              messageReference: "ref-789",
              cascadeType: "primary",
              cascadeOrder: 1,
              channel: "sms",
              channelStatus: "delivered",
              channelStatusDescription: "SMS delivered successfully",
              channelFailureReasonCode: undefined,
              supplierStatus: "delivered",
              timestamp: "2026-02-05T14:30:00Z",
              retryCount: 0,
            },
            links: {
              message: "/v1/message-batches/messages/msg-456",
            },
            meta: {
              idempotencyKey: "762f9510-f39c-52e5-b827-557766552222",
            },
          },
        ],
      };

      it("should log channel status callback with all fields", () => {
        logCallbackGenerated(
          mockLogger,
          channelStatusPayload,
          EventTypes.CHANNEL_STATUS_PUBLISHED,
          "corr-789",
          "client-def",
        );

        expect(mockLogger.info).toHaveBeenCalledWith("Callback generated", {
          correlationId: "corr-789",
          callbackType: "ChannelStatus",
          clientId: "client-def",
          messageId: "msg-456",
          messageReference: "ref-789",
          channel: "sms",
          channelStatus: "delivered",
          channelStatusDescription: "SMS delivered successfully",
          channelFailureReasonCode: undefined,
          supplierStatus: "delivered",
        });
      });

      it("should log channel status callback with failure reason code", () => {
        const failedPayload: ClientCallbackPayload = {
          data: [
            {
              ...channelStatusPayload.data[0],
              attributes: {
                ...channelStatusPayload.data[0].attributes,
                channelStatus: "failed",
                channelStatusDescription: "Invalid phone number",
                channelFailureReasonCode: "ERR_INVALID_PHONE_NUMBER",
                supplierStatus: "permanent_failure",
              },
            },
          ],
        };

        logCallbackGenerated(
          mockLogger,
          failedPayload,
          EventTypes.CHANNEL_STATUS_PUBLISHED,
          "corr-999",
          "client-ghi",
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          "Callback generated",
          expect.objectContaining({
            channelStatus: "failed",
            channelFailureReasonCode: "ERR_INVALID_PHONE_NUMBER",
            supplierStatus: "permanent_failure",
          }),
        );
      });
    });

    describe("unsupported event types", () => {
      const genericPayload: ClientCallbackPayload = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-123",
              messageReference: "ref-456",
              messageStatus: "delivered",
              messageStatusDescription: "Message successfully delivered",
              messageFailureReasonCode: undefined,
              channels: [],
              timestamp: "2026-02-05T14:29:55Z",
              routingPlan: {
                id: "routing-plan-123",
                name: "Test",
                version: "v1",
                createdDate: "2023-11-17T14:27:51.413Z",
              },
            },
            links: {
              message: "/v1/message-batches/messages/msg-123",
            },
            meta: {
              idempotencyKey: "661f9510-f39c-52e5-b827-557766551111",
            },
          },
        ],
      };

      it("should log with common fields only for unknown event type", () => {
        logCallbackGenerated(
          mockLogger,
          genericPayload,
          "uk.nhs.notify.unknown.event.type",
          "corr-000",
          "client-zzz",
        );

        expect(mockLogger.info).toHaveBeenCalledWith("Callback generated", {
          correlationId: "corr-000",
          callbackType: "MessageStatus",
          clientId: "client-zzz",
          messageId: "msg-123",
          messageReference: "ref-456",
        });
      });
    });
  });

  describe("logCallbackSigned", () => {
    const messageStatusPayload: ClientCallbackPayload = {
      data: [
        {
          type: "MessageStatus",
          attributes: {
            messageId: "msg-123",
            messageReference: "ref-456",
            messageStatus: "delivered",
            messageStatusDescription: "Message successfully delivered",
            messageFailureReasonCode: undefined,
            channels: [],
            timestamp: "2026-02-05T14:29:55Z",
            routingPlan: {
              id: "routing-plan-123",
              name: "Test",
              version: "v1",
              createdDate: "2023-11-17T14:27:51.413Z",
            },
          },
          links: { message: "/v1/message-batches/messages/msg-123" },
          meta: { idempotencyKey: "661f9510-f39c-52e5-b827-557766551111" },
        },
      ],
    };

    const channelStatusPayload: ClientCallbackPayload = {
      data: [
        {
          type: "ChannelStatus",
          attributes: {
            messageId: "msg-456",
            messageReference: "ref-789",
            cascadeType: "primary",
            cascadeOrder: 1,
            channel: "sms",
            channelStatus: "delivered",
            channelStatusDescription: "SMS delivered successfully",
            channelFailureReasonCode: undefined,
            supplierStatus: "delivered",
            timestamp: "2026-02-05T14:30:00Z",
            retryCount: 0,
          },
          links: { message: "/v1/message-batches/messages/msg-456" },
          meta: { idempotencyKey: "762f9510-f39c-52e5-b827-557766552222" },
        },
      ],
    };

    it("should log Callback signed with signature for MessageStatus", () => {
      logCallbackSigned(
        mockLogger,
        messageStatusPayload,
        "corr-123",
        "client-abc",
        "abc123signature",
      );

      expect(mockLogger.info).toHaveBeenCalledWith("Callback signed", {
        correlationId: "corr-123",
        callbackType: "MessageStatus",
        clientId: "client-abc",
        signature: "abc123signature",
        payload: JSON.stringify(messageStatusPayload.data[0]),
      });
    });

    it("should log Callback signed with signature for ChannelStatus", () => {
      logCallbackSigned(
        mockLogger,
        channelStatusPayload,
        "corr-789",
        "client-def",
        "defsignature456",
      );

      expect(mockLogger.info).toHaveBeenCalledWith("Callback signed", {
        correlationId: "corr-789",
        callbackType: "ChannelStatus",
        clientId: "client-def",
        signature: "defsignature456",
        payload: JSON.stringify(channelStatusPayload.data[0]),
      });
    });

    it("should log standard fields for any event type", () => {
      logCallbackSigned(
        mockLogger,
        messageStatusPayload,
        "corr-000",
        "client-zzz",
        "unknownsig",
      );

      expect(mockLogger.info).toHaveBeenCalledWith("Callback signed", {
        correlationId: "corr-000",
        callbackType: "MessageStatus",
        clientId: "client-zzz",
        signature: "unknownsig",
        payload: JSON.stringify(messageStatusPayload.data[0]),
      });
    });

    it("should handle undefined correlationId", () => {
      logCallbackSigned(
        mockLogger,
        messageStatusPayload,
        undefined,
        "client-abc",
        "somesig",
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Callback signed",
        expect.objectContaining({
          correlationId: undefined,
          signature: "somesig",
        }),
      );
    });
  });
});
