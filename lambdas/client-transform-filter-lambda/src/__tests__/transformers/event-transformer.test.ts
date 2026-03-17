import type { StatusPublishEvent } from "@nhs-notify-client-callbacks/models";
import { TransformationError } from "services/error-handler";
import { transformEvent } from "services/transformers/event-transformer";
import {
  expectedMessageStatusAttributes,
  expectedMessageStatusAttributesWithFailure,
  messageStatusEvent,
  messageStatusEventWithFailure,
} from "__tests__/fixtures/core-domain-events/message-status-event";
import {
  channelStatusEvent,
  channelStatusEventWithFailure,
  expectedChannelStatusAttributes,
  expectedChannelStatusAttributesWithFailure,
} from "__tests__/fixtures/core-domain-events/channel-status-event";
import {
  extractChannelStatusAttributes,
  extractMessageStatusAttributes,
} from "__tests__/utils/payload-comparator";

describe("event-transformer", () => {
  describe("transformEvent", () => {
    describe("message status events", () => {
      it("transforms message status event to callback payload with correct attributes", () => {
        const result = transformEvent(
          messageStatusEvent,
          "corr-msg-001",
          "/v1/message-batches",
        );
        const attributes = extractMessageStatusAttributes(result);

        expect(attributes).toEqual(expectedMessageStatusAttributes);
      });

      it("transforms failed message status event with failure fields", () => {
        const result = transformEvent(
          messageStatusEventWithFailure,
          "corr-msg-002",
          "/v1/message-batches",
        );
        const attributes = extractMessageStatusAttributes(result);

        expect(attributes).toEqual(expectedMessageStatusAttributesWithFailure);
      });

      it("produces MessageStatus type in data array", () => {
        const result = transformEvent(
          messageStatusEvent,
          "corr-msg-003",
          "/v1/message-batches",
        );

        expect(result.data[0].type).toBe("MessageStatus");
      });

      it("produces correct message link", () => {
        const result = transformEvent(
          messageStatusEvent,
          "corr-msg-004",
          "/v1/message-batches",
        );

        expect(result.data[0].links.message).toBe(
          `/v1/message-batches/messages/${messageStatusEvent.data.messageId}`,
        );
      });
    });

    describe("channel status events", () => {
      it("transforms channel status event to callback payload with correct attributes", () => {
        const result = transformEvent(
          channelStatusEvent,
          "corr-ch-001",
          "/v1/message-batches",
        );
        const attributes = extractChannelStatusAttributes(result);

        expect(attributes).toEqual(expectedChannelStatusAttributes);
      });

      it("transforms failed channel status event with failure fields", () => {
        const result = transformEvent(
          channelStatusEventWithFailure,
          "corr-ch-002",
          "/v1/message-batches",
        );
        const attributes = extractChannelStatusAttributes(result);

        expect(attributes).toEqual(expectedChannelStatusAttributesWithFailure);
      });

      it("produces ChannelStatus type in data array", () => {
        const result = transformEvent(
          channelStatusEvent,
          "corr-ch-003",
          "/v1/message-batches",
        );

        expect(result.data[0].type).toBe("ChannelStatus");
      });

      it("produces correct message link", () => {
        const result = transformEvent(
          channelStatusEvent,
          "corr-ch-004",
          "/v1/message-batches",
        );

        expect(result.data[0].links.message).toBe(
          `/v1/message-batches/messages/${channelStatusEvent.data.messageId}`,
        );
      });
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
