import type {
  ClientSubscriptionConfiguration,
  MessageStatus,
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
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
  notifyData: T,
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
  data: notifyData,
});

const createMessageStatusConfig = (
  statuses: MessageStatus[],
  clientId = "client-1",
): ClientSubscriptionConfiguration => [
  {
    SubscriptionId: "00000000-0000-0000-0000-000000000001",
    ClientId: clientId,
    Targets: [
      {
        Type: "API",
        TargetId: "target",
        InvocationEndpoint: "https://example.com",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "secret",
        },
      },
    ],
    SubscriptionType: "MessageStatus",
    MessageStatuses: statuses,
  },
];

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
    const notifyData = createMessageStatusData();
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      notifyData,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        {
          event,
          notifyData,
        },
      ),
    ).toBe(true);
  });

  it("rejects when clientId does not match", () => {
    const notifyData = createMessageStatusData({ clientId: "client-2" });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      notifyData,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        {
          event,
          notifyData,
        },
      ),
    ).toBe(false);
  });

  it("rejects when status does not match", () => {
    const notifyData = createMessageStatusData({ messageStatus: "FAILED" });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      notifyData,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        {
          event,
          notifyData,
        },
      ),
    ).toBe(false);
  });

  it("rejects when status has not changed", () => {
    const notifyData = createMessageStatusData({
      messageStatus: "DELIVERED",
      previousMessageStatus: "DELIVERED",
    });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      notifyData,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        {
          event,
          notifyData,
        },
      ),
    ).toBe(false);
  });

  it("matches when status has changed", () => {
    const notifyData = createMessageStatusData({
      messageStatus: "DELIVERED",
      previousMessageStatus: "PENDING_ENRICHMENT",
    });
    const event = createBaseEvent(
      EventTypes.MESSAGE_STATUS_PUBLISHED,
      "source-a",
      notifyData,
    );
    expect(
      matchesMessageStatusSubscription(
        createMessageStatusConfig(["DELIVERED"]),
        {
          event,
          notifyData,
        },
      ),
    ).toBe(true);
  });
});
