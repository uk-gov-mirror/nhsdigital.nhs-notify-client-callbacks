import {
  buildChannelStatusSubscription,
  buildMessageStatusSubscription,
  buildTarget,
} from "src/domain/client-subscription-builder";

const UUID_REGEX =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

describe("buildTarget", () => {
  it("builds a target with required fields", () => {
    const result = buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      apiKeyHeaderName: "x-api-key",
      rateLimit: 10,
    });

    expect(result).toMatchObject({
      type: "API",
      invocationEndpoint: "https://example.com/webhook",
      invocationMethod: "POST",
      invocationRateLimit: 10,
      apiKey: { headerName: "x-api-key", headerValue: "secret" },
    });
    expect(result.targetId).toMatch(UUID_REGEX);
  });

  it("defaults apiKeyHeaderName to x-api-key when not provided", () => {
    const result = buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 5,
    });

    expect(result.apiKey.headerName).toBe("x-api-key");
  });
});

describe("buildMessageStatusSubscription", () => {
  it("builds message status subscription", () => {
    const result = buildMessageStatusSubscription({
      subscriptionId: "sub-001",
      targetIds: ["target-001"],
      messageStatuses: ["DELIVERED"],
    });

    expect(result).toEqual({
      subscriptionId: "sub-001",
      subscriptionType: "MessageStatus",
      targetIds: ["target-001"],
      messageStatuses: ["DELIVERED"],
    });
  });
});

describe("buildChannelStatusSubscription", () => {
  it("builds channel status subscription with all fields", () => {
    const result = buildChannelStatusSubscription({
      subscriptionId: "sub-002",
      targetIds: ["target-001"],
      channelType: "SMS",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
    });

    expect(result).toEqual({
      subscriptionId: "sub-002",
      subscriptionType: "ChannelStatus",
      targetIds: ["target-001"],
      channelType: "SMS",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
    });
  });

  it("defaults channelStatuses and supplierStatuses to [] when not provided", () => {
    const result = buildChannelStatusSubscription({
      subscriptionId: "sub-003",
      targetIds: ["target-001"],
      channelType: "SMS",
    });

    expect(result.channelStatuses).toEqual([]);
    expect(result.supplierStatuses).toEqual([]);
  });
});
