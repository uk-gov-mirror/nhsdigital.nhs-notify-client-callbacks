import type {
  ChannelStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import { createChannelStatusConfig } from "__tests__/helpers/client-subscription-fixtures";
import { matchesChannelStatusSubscription } from "services/filters/channel-status-filter";

jest.mock("services/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const createBaseEvent = <T>(
  type: string,
  source: string,
  data: T,
): StatusPublishEvent<T> => ({
  specversion: "1.0",
  id: "event-id",
  source,
  subject: "subject",
  type,
  time: "2025-01-01T10:00:00Z",
  datacontenttype: "application/json",
  dataschema: "schema",
  traceparent: "traceparent",
  data,
});

const createChannelStatusData = (
  overrides: Partial<ChannelStatusData> = {},
): ChannelStatusData => ({
  messageId: "message-id",
  messageReference: "reference",
  channel: "EMAIL",
  channelStatus: "DELIVERED",
  supplierStatus: "read",
  cascadeType: "primary",
  cascadeOrder: 1,
  timestamp: "2025-01-01T10:00:00Z",
  retryCount: 0,
  clientId: "client-1",
  ...overrides,
});

describe("matchesChannelStatusSubscription", () => {
  it("matches by channel and supplier status", () => {
    const data = createChannelStatusData();
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(true);
  });

  it("rejects when channel does not match", () => {
    const data = createChannelStatusData({ channel: "SMS" });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when clientId does not match", () => {
    const data = createChannelStatusData({ clientId: "client-2" });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when channelStatus does not match", () => {
    const data = createChannelStatusData({
      channelStatus: "FAILED",
      previousChannelStatus: "SENDING",
      supplierStatus: "read",
      previousSupplierStatus: "read",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when supplierStatus does not match", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "DELIVERED",
      supplierStatus: "rejected",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when neither status changed", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "DELIVERED",
      supplierStatus: "read",
      previousSupplierStatus: "read",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(false);
  });

  it("matches when only channelStatus changed and is subscribed (OR logic)", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "SENDING",
      supplierStatus: "notified",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(true);
  });

  it("matches when only supplierStatus changed and is subscribed (OR logic)", () => {
    const data = createChannelStatusData({
      channelStatus: "SENDING",
      previousChannelStatus: "SENDING",
      supplierStatus: "read",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], ["read"]),
        event,
      ),
    ).toBe(true);
  });

  it("matches with empty supplierStatuses when channelStatus changed", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "SENDING",
      supplierStatus: "read",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig(["DELIVERED"], []),
        event,
      ),
    ).toBe(true);
  });

  it("matches with empty channelStatuses when supplierStatus changed", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "SENDING",
      supplierStatus: "read",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig([], ["read"]),
        event,
      ),
    ).toBe(true);
  });

  it("rejects with both channelStatuses and supplierStatuses empty", () => {
    const data = createChannelStatusData({
      channelStatus: "DELIVERED",
      previousChannelStatus: "SENDING",
      supplierStatus: "read",
      previousSupplierStatus: "notified",
    });
    const event = createBaseEvent(
      EventTypes.CHANNEL_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesChannelStatusSubscription(
        createChannelStatusConfig([], []),
        event,
      ),
    ).toBe(false);
  });
});
