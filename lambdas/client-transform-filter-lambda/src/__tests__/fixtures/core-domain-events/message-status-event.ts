import type {
  MessageStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

export const messageStatusEvent: StatusPublishEvent<MessageStatusData> = {
  specversion: "1.0",
  id: "00000000-0000-0000-0000-000000000000",
  source: "test",
  subject: "test",
  type: "uk.nhs.notify.message.status.PUBLISHED.v1",
  time: "1970-01-01T00:00:00Z",
  datacontenttype: "application/json",
  dataschema: "test",
  traceparent: "00-00000000000000000000000000000000-0000000000000000-00",
  data: {
    clientId: "00000000-0000-0000-0000-000000000000",
    messageId: "00000000-0000-0000-0000-000000000000",
    messageReference: "00000000-0000-0000-0000-000000000000",
    messageStatus: "DELIVERED",
    channels: [
      { type: "NHSAPP", channelStatus: "DELIVERED" },
      { type: "SMS", channelStatus: "SKIPPED" },
    ],
    timestamp: "1970-01-01T00:00:00Z",
    routingPlan: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "",
      version: "",
      createdDate: "",
    },
  },
};

export const messageStatusEventWithFailure: StatusPublishEvent<MessageStatusData> =
  {
    ...messageStatusEvent,
    id: "00000000-0000-0000-0000-000000000001",
    data: {
      ...messageStatusEvent.data,
      messageStatus: "FAILED",
      messageStatusDescription: "test",
      messageFailureReasonCode: "test",
      channels: [{ type: "NHSAPP", channelStatus: "FAILED" }],
    },
  };

export const expectedMessageStatusAttributes = {
  messageId: "00000000-0000-0000-0000-000000000000",
  messageReference: "00000000-0000-0000-0000-000000000000",
  messageStatus: "delivered",
  channels: [
    { type: "nhsapp", channelStatus: "delivered" },
    { type: "sms", channelStatus: "skipped" },
  ],
  timestamp: "1970-01-01T00:00:00Z",
  routingPlan: {
    id: "00000000-0000-0000-0000-000000000000",
    name: "",
    version: "",
    createdDate: "",
  },
};

export const expectedMessageStatusAttributesWithFailure = {
  ...expectedMessageStatusAttributes,
  messageStatus: "failed",
  messageStatusDescription: "test",
  messageFailureReasonCode: "test",
  channels: [{ type: "nhsapp", channelStatus: "failed" }],
};
