import { EventTypes } from "models/status-publish-event";

// coverage purposes
describe("EventTypes", () => {
  it("should match the expected event type values", () => {
    expect(EventTypes).toEqual({
      MESSAGE_STATUS_PUBLISHED: "uk.nhs.notify.message.status.PUBLISHED.v1",
      CHANNEL_STATUS_PUBLISHED: "uk.nhs.notify.channel.status.PUBLISHED.v1",
    });
  });
});
