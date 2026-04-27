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

  it("prefixes messageId with force-{code}- when forcedStatusCode is set", () => {
    const event = createMessageStatusEvent(
      "perf-client-1",
      "DELIVERED",
      500,
    );

    expect(event.data.messageId).toMatch(/^force-500-[0-9a-f-]+$/);
  });

  it("prefixes messageId with force-{code}-until-{timestamp}- when both forced fields are set", () => {
    const until = Date.now() + 60_000;
    const event = createMessageStatusEvent(
      "perf-client-1",
      "DELIVERED",
      500,
      until,
    );

    expect(event.data.messageId).toMatch(
      new RegExp(`^force-500-until-${until}-[0-9a-f-]+$`),
    );
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

  it("prefixes messageId with force-{code}- when forcedStatusCode is set", () => {
    const event = createChannelStatusEvent("perf-client-2", "DELIVERED", 503);

    expect(event.data.messageId).toMatch(/^force-503-[0-9a-f-]+$/);
  });

  it("prefixes messageId with force-{code}-until-{timestamp}- when both forced fields are set", () => {
    const until = Date.now() + 60_000;
    const event = createChannelStatusEvent(
      "perf-client-2",
      "DELIVERED",
      503,
      until,
    );

    expect(event.data.messageId).toMatch(
      new RegExp(`^force-503-until-${until}-[0-9a-f-]+$`),
    );
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

  it("forwards forcedStatusCode and forcedStatusCodeUntilMs from the mix entry", () => {
    const until = Date.now() + 60_000;
    const event = createEvent({
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "DELIVERED",
      forcedStatusCode: 500,
      forcedStatusCodeUntilMs: until,
    });

    expect(event.data.messageId).toMatch(
      new RegExp(`^force-500-until-${until}-[0-9a-f-]+$`),
    );
  });
});
