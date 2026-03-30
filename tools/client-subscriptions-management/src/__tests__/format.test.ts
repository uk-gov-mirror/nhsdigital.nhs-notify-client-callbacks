import {
  formatApplicationsMap,
  formatClientConfig,
  formatSubscriptionsTable,
  formatTargetsTable,
  normalizeClientName,
} from "src/format";
import {
  DEFAULT_TARGET_ID as TARGET_ID,
  createChannelStatusSubscription,
  createClientSubscriptionConfig,
  createMessageStatusSubscription,
  createTarget,
} from "src/__tests__/helpers/client-subscription-fixtures";

describe("format", () => {
  const target = createTarget();
  const messageSubscription = createMessageStatusSubscription();
  const channelSubscription = createChannelStatusSubscription();

  const config = createClientSubscriptionConfig({
    clientId: "client-a",
    subscriptions: [messageSubscription, channelSubscription],
    targets: [target],
  });

  it("formats subscriptions as a table string", () => {
    const result = formatSubscriptionsTable(config.subscriptions);

    expect(typeof result).toBe("string");
    expect(result).toContain("sub-001");
    expect(result).toContain("MessageStatus");
    expect(result).toContain("DELIVERED");
    expect(result).toContain("sub-002");
    expect(result).toContain("ChannelStatus");
    expect(result).toContain("SMS");
  });

  it("formats targets as a table string", () => {
    const result = formatTargetsTable(config.targets);

    expect(typeof result).toBe("string");
    expect(result).toContain(TARGET_ID);
    expect(result).toContain("https://example.com/webhook");
    expect(result).toContain("x-api-key");
  });

  it("formats full client config including header and both tables", () => {
    const result = formatClientConfig(config);

    expect(result).toContain("Client: client-a");
    expect(result).toContain("Subscriptions:");
    expect(result).toContain("Targets:");
  });

  it("shows (none) when subscriptions is empty", () => {
    const empty = createClientSubscriptionConfig({
      clientId: "empty-client",
      targets: [target],
    });

    expect(formatClientConfig(empty)).toContain("Subscriptions: (none)");
  });

  it("shows (none) when targets is empty", () => {
    const empty = createClientSubscriptionConfig({
      clientId: "empty-client",
      subscriptions: [messageSubscription],
    });

    expect(formatClientConfig(empty)).toContain("Targets: (none)");
  });

  it("normalizes client name", () => {
    expect(normalizeClientName("My  Client Name")).toBe("my-client-name");
  });

  it("formats empty applications map", () => {
    expect(formatApplicationsMap(new Map())).toBe("Applications map: (empty)");
  });

  it("masks application IDs in applications map output", () => {
    const result = formatApplicationsMap(
      new Map([
        ["client-a", "app-12345"],
        ["client-b", "a"],
      ]),
    );

    expect(result).toContain("client-a");
    expect(result).toContain("client-b");
    expect(result).toContain("*********");
    expect(result).toContain("*");
    expect(result).not.toContain("app-12345");
  });
});
