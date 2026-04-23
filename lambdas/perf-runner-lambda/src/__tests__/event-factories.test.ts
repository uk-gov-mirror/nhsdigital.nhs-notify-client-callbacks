import { EventTypes } from "@nhs-notify-client-callbacks/models";
import {
  createChannelStatusEvent,
  createEvent,
  createMessageStatusEvent,
} from "event-factories";

describe("createMessageStatusEvent", () => {
  it("creates a valid message status CloudEvent with the given clientId and status", () => {
    const event = createMessageStatusEvent("perf-client-1", "DELIVERED");

    expect(event.specversion).toBe("1.0");
    expect(event.type).toBe(EventTypes.MESSAGE_STATUS_PUBLISHED);
    expect(event.datacontenttype).toBe("application/json");
    expect(event.data.clientId).toBe("perf-client-1");
    expect(event.data.messageStatus).toBe("DELIVERED");
    expect(event.data.messageId).toBeTruthy();
    expect(event.id).toBeTruthy();
  });

  it("assigns a unique id and messageId on each call", () => {
    const a = createMessageStatusEvent("perf-client-1", "FAILED");
    const b = createMessageStatusEvent("perf-client-1", "FAILED");

    expect(a.id).not.toBe(b.id);
    expect(a.data.messageId).not.toBe(b.data.messageId);
  });
});

describe("createChannelStatusEvent", () => {
  it("creates a valid channel status CloudEvent with the given clientId and status", () => {
    const event = createChannelStatusEvent("perf-client-2", "DELIVERED");

    expect(event.specversion).toBe("1.0");
    expect(event.type).toBe(EventTypes.CHANNEL_STATUS_PUBLISHED);
    expect(event.datacontenttype).toBe("application/json");
    expect(event.data.clientId).toBe("perf-client-2");
    expect(event.data.channelStatus).toBe("DELIVERED");
    expect(event.data.messageId).toBeTruthy();
    expect(event.id).toBeTruthy();
  });
});

describe("createEvent", () => {
  it("delegates to createMessageStatusEvent for messageStatus factory entries", () => {
    const event = createEvent({
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "SENDING",
    });

    expect(event.type).toBe(EventTypes.MESSAGE_STATUS_PUBLISHED);
    expect(event.data.clientId).toBe("perf-client-1");
  });

  it("delegates to createChannelStatusEvent for channelStatus factory entries", () => {
    const event = createEvent({
      weight: 1,
      factory: "channelStatus",
      clientId: "perf-client-2",
      channelStatus: "FAILED",
    });

    expect(event.type).toBe(EventTypes.CHANNEL_STATUS_PUBLISHED);
    expect(event.data.clientId).toBe("perf-client-2");
  });
});
