import type {
  Channel,
  ChannelStatus,
  ChannelStatusData,
  MessageStatus,
  MessageStatusData,
  StatusPublishEvent,
  SupplierStatus,
} from "@nhs-notify-client-callbacks/models";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import {
  createChannelStatusConfig,
  createChannelStatusSubscription,
  createClientSubscriptionConfig,
  createMessageStatusConfig,
  createMessageStatusSubscription,
} from "__tests__/helpers/client-subscription-fixtures";
import { TransformationError } from "services/error-handler";
import { evaluateSubscriptionFilters } from "services/subscription-filter";

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
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
      const config = createMessageStatusConfig(["DELIVERED"], "client-1");

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "MessageStatus",
        targetIds: ["00000000-0000-4000-8000-000000000001"],
        subscriptionIds: ["00000000-0000-0000-0000-000000000001"],
      });
    });

    it("returns matched false when status does not match subscription", () => {
      const event = createMessageStatusEvent("client-1", "FAILED");
      const config = createMessageStatusConfig(["DELIVERED"], "client-1");

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: false,
        subscriptionType: "MessageStatus",
      });
    });

    it("returns only matched subscription target IDs and subscription IDs", () => {
      const event = createMessageStatusEvent("client-1", "DELIVERED");
      const config = createClientSubscriptionConfig("client-1", {
        subscriptions: [
          createMessageStatusSubscription(["DELIVERED"], {
            subscriptionId: "sub-a",
            targetIds: ["target-a"],
          }),
          createMessageStatusSubscription(["FAILED"], {
            subscriptionId: "sub-b",
            targetIds: ["target-b"],
          }),
        ],
      });

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "MessageStatus",
        targetIds: ["target-a"],
        subscriptionIds: ["sub-a"],
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
        ["DELIVERED"],
        ["delivered"],
        "client-1",
        "EMAIL",
      );

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "ChannelStatus",
        targetIds: ["00000000-0000-4000-8000-000000000001"],
        subscriptionIds: ["00000000-0000-0000-0000-000000000002"],
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
        ["DELIVERED"],
        ["delivered"],
        "client-1",
        "EMAIL",
      );

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: false,
        subscriptionType: "ChannelStatus",
      });
    });

    it("returns only matched channel subscription target IDs and subscription IDs", () => {
      const event = createChannelStatusEvent(
        "client-1",
        "SMS",
        "FAILED",
        "permanent_failure",
        "DELIVERED",
        "delivered",
      );
      const config = createClientSubscriptionConfig("client-1", {
        subscriptions: [
          createChannelStatusSubscription(
            ["DELIVERED"],
            ["delivered"],
            "EMAIL",
            {
              subscriptionId: "sub-email",
              targetIds: ["target-email"],
            },
          ),
          createChannelStatusSubscription(
            ["FAILED"],
            ["permanent_failure"],
            "SMS",
            {
              subscriptionId: "sub-sms",
              targetIds: ["target-sms"],
            },
          ),
        ],
      });

      const result = evaluateSubscriptionFilters(event, config);

      expect(result).toEqual({
        matched: true,
        subscriptionType: "ChannelStatus",
        targetIds: ["target-sms"],
        subscriptionIds: ["sub-sms"],
      });
    });
  });

  describe("when event type is unknown", () => {
    it("throws a TransformationError", () => {
      const event = {
        ...createMessageStatusEvent("client-1", "DELIVERED"),
        type: "unknown-event-type",
      } as StatusPublishEvent;
      const config = createMessageStatusConfig(["DELIVERED"], "client-1");

      expect(() => evaluateSubscriptionFilters(event, config)).toThrow(
        new TransformationError("Unsupported event type: unknown-event-type"),
      );
    });
  });
});
