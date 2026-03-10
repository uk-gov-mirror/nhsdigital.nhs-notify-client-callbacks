import type {
  Channel,
  ChannelStatus,
  ChannelStatusData,
  ClientSubscriptionConfiguration,
  MessageStatus,
  MessageStatusData,
  StatusPublishEvent,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import { TransformationError } from "services/error-handler";
import { evaluateSubscriptionFilters } from "services/subscription-filter";

jest.mock("services/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const createMessageStatusEvent = (
  clientId: string,
  status: MessageStatus,
): StatusPublishEvent<MessageStatusData> => ({
  specversion: "1.0",
  id: "event-id",
  source: "source-a",
  subject: "subject",
  type: EventTypes.MESSAGE_STATUS_PUBLISHED,
  time: "2025-01-01T10:00:00Z",
  datacontenttype: "application/json",
  dataschema: "schema",
  traceparent: "traceparent",
  data: {
    messageId: "msg-123",
    messageReference: "ref-123",
    messageStatus: status,
    channels: [],
    timestamp: "2025-01-01T10:00:00Z",
    routingPlan: {
      id: "plan-id",
      name: "plan-name",
      version: "1",
      createdDate: "2025-01-01T10:00:00Z",
    },
    clientId,
  },
});

const createChannelStatusEvent = (
  clientId: string,
  channel: Channel,
  channelStatus: ChannelStatus,
  supplierStatus: SupplierStatus,
  previousChannelStatus?: ChannelStatus,
  previousSupplierStatus?: SupplierStatus,
): StatusPublishEvent<ChannelStatusData> => ({
  specversion: "1.0",
  id: "event-id",
  source: "source-a",
  subject: "subject",
  type: EventTypes.CHANNEL_STATUS_PUBLISHED,
  time: "2025-01-01T10:00:00Z",
  datacontenttype: "application/json",
  dataschema: "schema",
  traceparent: "traceparent",
  data: {
    messageId: "msg-123",
    messageReference: "ref-123",
    channel,
    channelStatus,
    previousChannelStatus,
    supplierStatus,
    previousSupplierStatus,
    cascadeType: "primary" as const,
    cascadeOrder: 1,
    timestamp: "2025-01-01T10:00:00Z",
    retryCount: 0,
    clientId,
  },
});

const createMessageStatusConfig = (
  clientId: string,
  statuses: MessageStatus[],
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

const createChannelStatusConfig = (
  clientId: string,
  channelType: Channel,
  channelStatuses: ChannelStatus[],
  supplierStatuses: SupplierStatus[],
): ClientSubscriptionConfiguration => [
  {
    SubscriptionId: "00000000-0000-0000-0000-000000000002",
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
    SubscriptionType: "ChannelStatus",
    ChannelType: channelType,
    ChannelStatuses: channelStatuses,
    SupplierStatuses: supplierStatuses,
  },
];

describe("evaluateSubscriptionFilters", () => {
  describe("when config is undefined", () => {
    it("returns not matched with Unknown subscription type", () => {
      const event = createMessageStatusEvent("client-1", "DELIVERED");
      const result = evaluateSubscriptionFilters(event, undefined);

      expect(result).toEqual({
        matched: false,
        subscriptionType: "Unknown",
      });
    });
  });

  describe("when event is MessageStatus", () => {
    it("returns matched true when status matches subscription", () => {
      const event = createMessageStatusEvent("client-1", "DELIVERED");
      const config = createMessageStatusConfig("client-1", ["DELIVERED"]);

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "MessageStatus",
      });
    });

    it("returns matched false when status does not match subscription", () => {
      const event = createMessageStatusEvent("client-1", "FAILED");
      const config = createMessageStatusConfig("client-1", ["DELIVERED"]);

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: false,
        subscriptionType: "MessageStatus",
      });
    });
  });

  describe("when event is ChannelStatus", () => {
    it("returns matched true when channel and statuses match subscription", () => {
      const event = createChannelStatusEvent(
        "client-1",
        "EMAIL",
        "DELIVERED",
        "delivered",
        "SENDING",
        "notified",
      );
      const config = createChannelStatusConfig(
        "client-1",
        "EMAIL",
        ["DELIVERED"],
        ["delivered"],
      );

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "ChannelStatus",
      });
    });

    it("returns matched false when channel status does not match subscription", () => {
      const event = createChannelStatusEvent(
        "client-1",
        "EMAIL",
        "FAILED",
        "delivered",
        "FAILED", // previousChannelStatus (no change)
        "delivered", // previousSupplierStatus (no change)
      );
      const config = createChannelStatusConfig(
        "client-1",
        "EMAIL",
        ["DELIVERED"],
        ["delivered"],
      );

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: false,
        subscriptionType: "ChannelStatus",
      });
    });
  });

  describe("when event type is unknown", () => {
    it("throws a TransformationError", () => {
      const event = {
        ...createMessageStatusEvent("client-1", "DELIVERED"),
        type: "unknown-event-type",
      } as StatusPublishEvent;
      const config = createMessageStatusConfig("client-1", ["DELIVERED"]);

      expect(() => evaluateSubscriptionFilters(event, config)).toThrow(
        new TransformationError("Unsupported event type: unknown-event-type"),
      );
    });
  });
});
