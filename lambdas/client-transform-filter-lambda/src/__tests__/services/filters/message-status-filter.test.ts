import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import { createMessageStatusConfig } from "__tests__/helpers/client-subscription-fixtures";
import { matchesMessageStatusSubscription } from "services/filters/message-status-filter";

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

const createMessageStatusData = (
  overrides: Partial<MessageStatusData> = {},
): MessageStatusData => ({
  messageId: "message-id",
  messageReference: "reference",
  messageStatus: "DELIVERED",
  channels: [],
  timestamp: "2025-01-01T10:00:00Z",
  routingPlan: {
    id: "plan-id",
    name: "plan-name",
    version: "1",
    createdDate: "2025-01-01T10:00:00Z",
  },
  clientId: "client-1",
  ...overrides,
});

describe("matchesMessageStatusSubscription", () => {
  it("matches by client, status, and event pattern", () => {
    const data = createMessageStatusData();
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        event,
      ),
    ).toBe(true);
  });

  it("rejects when clientId does not match", () => {
    const data = createMessageStatusData({ clientId: "client-2" });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when status does not match", () => {
    const data = createMessageStatusData({ messageStatus: "FAILED" });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        event,
      ),
    ).toBe(false);
  });

  it("rejects when status has not changed", () => {
    const data = createMessageStatusData({
      messageStatus: "DELIVERED",
      previousMessageStatus: "DELIVERED",
    });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        event,
      ),
    ).toBe(false);
  });

  it("matches when status has changed", () => {
    const data = createMessageStatusData({
      messageStatus: "DELIVERED",
      previousMessageStatus: "PENDING_ENRICHMENT",
    });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      data,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        event,
      ),
    ).toBe(true);
  });
});
