import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import { ConfigCache } from "config-cache";

const createConfig = (clientId: string): ClientSubscriptionConfiguration => ({
  clientId,
  subscriptions: [],
  targets: [],
});

describe("ConfigCache", () => {
  it("stores and retrieves configuration", () => {
    const cache = new ConfigCache(60_000);
    const config = createConfig("client-1");

    cache.set("client-1", config);

    expect(cache.get("client-1")).toEqual(config);
  });

  it("returns undefined for non-existent key", () => {
    const cache = new ConfigCache(60_000);

    expect(cache.get("non-existent")).toBeUndefined();
  });

  it("returns cached value without re-fetch when within TTL", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    const cache = new ConfigCache(5000);
    const config = createConfig("client-1");

    cache.set("client-1", config);

    jest.advanceTimersByTime(4999);

    expect(cache.get("client-1")).toEqual(config);

    jest.useRealTimers();
  });

  it("returns undefined for expired entries after TTL", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    const cache = new ConfigCache(1000);
    const config = createConfig("client-1");

    cache.set("client-1", config);
    expect(cache.get("client-1")).toEqual(config);

    jest.advanceTimersByTime(1001);

    expect(cache.get("client-1")).toBeUndefined();

    jest.useRealTimers();
  });

  it("clears all entries", () => {
    const cache = new ConfigCache(60_000);
    const configA = createConfig("client-a");
    const configB = createConfig("client-b");

    cache.set("client-a", configA);
    cache.set("client-b", configB);

    expect(cache.get("client-a")).toEqual(configA);
    expect(cache.get("client-b")).toEqual(configB);

    cache.clear();

    expect(cache.get("client-a")).toBeUndefined();
    expect(cache.get("client-b")).toBeUndefined();
  });
});
