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

describe("transform pipeline - event transformation", () => {
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
});
