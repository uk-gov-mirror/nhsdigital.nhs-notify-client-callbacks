import {
  buildChannelStatusSubscription,
  buildMessageStatusSubscription,
} from "src/domain/client-subscription-builder";

describe("buildMessageStatusSubscription", () => {
  it("builds message status subscription", () => {
    const result = buildMessageStatusSubscription({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      apiKeyHeaderName: "x-api-key",
      clientId: "client-1",
      clientName: "Client One",
      rateLimit: 10,
      statuses: ["DELIVERED"],
      dryRun: false,
    });

    expect(result).toMatchObject({
      SubscriptionId: "client-one",
      SubscriptionType: "MessageStatus",
      ClientId: "client-1",
      MessageStatuses: ["DELIVERED"],
    });
    expect(result.Targets[0].TargetId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    );
  });
});

describe("buildChannelStatusSubscription", () => {
  it("builds channel status subscription", () => {
    const result = buildChannelStatusSubscription({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      clientId: "client-1",
      clientName: "Client One",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
      channelType: "SMS",
      rateLimit: 20,
      dryRun: false,
    });

    expect(result).toMatchObject({
      SubscriptionId: "client-one-SMS",
      SubscriptionType: "ChannelStatus",
      ClientId: "client-1",
      ChannelType: "SMS",
      ChannelStatuses: ["DELIVERED"],
      SupplierStatuses: ["delivered"],
    });
    expect(result.Targets[0].TargetId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    );
  });

  it("defaults channelStatuses and supplierStatuses to [] when not provided", () => {
    const result = buildChannelStatusSubscription({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      clientId: "client-1",
      clientName: "Client One",
      channelType: "SMS",
      rateLimit: 10,
      dryRun: false,
    });

    expect(result.ChannelStatuses).toEqual([]);
    expect(result.SupplierStatuses).toEqual([]);
  });
});
