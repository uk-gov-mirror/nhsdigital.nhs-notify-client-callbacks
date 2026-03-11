import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { ConfigCache } from "services/config-cache";

describe("ConfigCache", () => {
  it("stores and retrieves configuration", () => {
    const cache = new ConfigCache(60_000);
    const config: ClientSubscriptionConfiguration = [
      {
        SubscriptionId: "00000000-0000-0000-0000-000000000001",
        ClientId: "client-1",
        Targets: [],
        SubscriptionType: "MessageStatus" as const,
        MessageStatuses: ["DELIVERED"],
      },
    ];

    cache.set("client-1", config);
    const result = cache.get("client-1");

    expect(result).toEqual(config);
  });

  it("returns undefined for non-existent key", () => {
    const cache = new ConfigCache(60_000);
    const result = cache.get("non-existent");

    expect(result).toBeUndefined();
  });

  it("returns undefined for expired entries", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T10:00:00Z"));

    const cache = new ConfigCache(1000); // 1 second TTL
    const config: ClientSubscriptionConfiguration = [
      {
        SubscriptionId: "00000000-0000-0000-0000-000000000001",
        ClientId: "client-1",
        Targets: [],
        SubscriptionType: "MessageStatus" as const,
        MessageStatuses: ["DELIVERED"],
      },
    ];

    cache.set("client-1", config);

    // Advance time past expiry
    jest.advanceTimersByTime(1500);

    const result = cache.get("client-1");

    expect(result).toBeUndefined();

    jest.useRealTimers();
  });

  it("clears all entries", () => {
    const cache = new ConfigCache(60_000);
    const config: ClientSubscriptionConfiguration = [
      {
        SubscriptionId: "00000000-0000-0000-0000-000000000001",
        ClientId: "client-1",
        Targets: [],
        SubscriptionType: "MessageStatus" as const,
        MessageStatuses: ["DELIVERED"],
      },
    ];

    cache.set("client-1", config);
    cache.set("client-2", config);

    cache.clear();

    expect(cache.get("client-1")).toBeUndefined();
    expect(cache.get("client-2")).toBeUndefined();
  });
});
