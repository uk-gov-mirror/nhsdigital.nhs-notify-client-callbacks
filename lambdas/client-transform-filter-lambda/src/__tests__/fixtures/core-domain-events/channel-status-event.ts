import type {
  ChannelStatusData,
  StatusPublishEvent,
} from "@nhs-notify-client-callbacks/models";

export const channelStatusEvent: StatusPublishEvent<ChannelStatusData> = {
  specversion: "1.0",
  id: "00000000-0000-0000-0000-000000000000",
  source: "test",
  subject: "test",
  type: "uk.nhs.notify.channel.status.PUBLISHED.v1",
  time: "1970-01-01T00:00:00Z",
  datacontenttype: "application/json",
  dataschema: "test",
  traceparent: "00-00000000000000000000000000000000-0000000000000000-00",
  data: {
    clientId: "00000000-0000-0000-0000-000000000000",
    messageId: "00000000-0000-0000-0000-000000000000",
    messageReference: "00000000-0000-0000-0000-000000000000",
    channel: "NHSAPP",
    channelStatus: "DELIVERED",
    channelStatusDescription: "test",
    supplierStatus: "delivered",
    cascadeType: "primary",
    cascadeOrder: 0,
    timestamp: "1970-01-01T00:00:00Z",
    retryCount: 0,
  },
};

export const channelStatusEventWithFailure: StatusPublishEvent<ChannelStatusData> =
  {
    ...channelStatusEvent,
    id: "00000000-0000-0000-0000-000000000001",
    data: {
      ...channelStatusEvent.data,
      channelStatus: "FAILED",
      channelStatusDescription: "test",
      channelFailureReasonCode: "test",
      supplierStatus: "failed",
      previousChannelStatus: "SENDING",
      previousSupplierStatus: "sending",
    },
  };

export const expectedChannelStatusAttributes = {
  messageId: "00000000-0000-0000-0000-000000000000",
  messageReference: "00000000-0000-0000-0000-000000000000",
  channel: "nhsapp",
  channelStatus: "delivered",
  channelStatusDescription: "test",
  supplierStatus: "delivered",
  cascadeType: "primary",
  cascadeOrder: 0,
  timestamp: "1970-01-01T00:00:00Z",
  retryCount: 0,
};

export const expectedChannelStatusAttributesWithFailure = {
  ...expectedChannelStatusAttributes,
  channelStatus: "failed",
  channelStatusDescription: "test",
  channelFailureReasonCode: "test",
  supplierStatus: "failed",
};
