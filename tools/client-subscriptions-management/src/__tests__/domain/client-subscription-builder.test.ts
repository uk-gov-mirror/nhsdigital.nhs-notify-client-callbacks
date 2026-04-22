import {
  buildChannelStatusSubscription,
  buildMessageStatusSubscription,
  buildTarget,
} from "src/domain/client-subscription-builder";

const UUID_REGEX =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

describe("buildTarget", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

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
      delivery: {
        mtls: { enabled: false, certPinning: { enabled: false } },
      },
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

  it("emits warning when mtls is disabled", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      mtls: { enabled: false },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("mTLS is disabled"),
    );
  });

  it("emits warning when mtls enabled but certPinning disabled", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      mtls: { enabled: true },
      certPinning: { enabled: false },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("certificate pinning is disabled"),
    );
  });

  it("throws when certPinning enabled without spkiHash", () => {
    expect(() =>
      buildTarget({
        apiEndpoint: "https://example.com/webhook",
        apiKey: "secret",
        rateLimit: 10,
        mtls: { enabled: true },
        certPinning: { enabled: true },
      }),
    ).toThrow("Certificate pinning cannot be enabled without an SPKI hash");
  });

  it("emits warning when certPinning enabled but mtls disabled", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      mtls: { enabled: false },
      certPinning: {
        enabled: true,
        spkiHash: "dGVzdGhhc2g9PT09PT09PT09PT09PT09PT09PT09PQ==",
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("mTLS is disabled"),
    );
  });

  it("emits no warnings for fully secure config", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      mtls: { enabled: true },
      certPinning: { enabled: true, spkiHash: "abc123" },
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits warning when maxRetryDurationSeconds is below 60", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      maxRetryDurationSeconds: 30,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("maxRetryDurationSeconds is 30s"),
    );
  });

  it("does not emit warning when maxRetryDurationSeconds is 60 or above", () => {
    buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      maxRetryDurationSeconds: 60,
      mtls: { enabled: true },
      certPinning: { enabled: true, spkiHash: "abc123" },
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("includes maxRetryDurationSeconds in delivery when provided", () => {
    const result = buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
      maxRetryDurationSeconds: 3600,
    });

    expect(result.delivery?.maxRetryDurationSeconds).toBe(3600);
  });

  it("omits maxRetryDurationSeconds from delivery when not provided", () => {
    const result = buildTarget({
      apiEndpoint: "https://example.com/webhook",
      apiKey: "secret",
      rateLimit: 10,
    });

    expect(result.delivery).not.toHaveProperty("maxRetryDurationSeconds");
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
