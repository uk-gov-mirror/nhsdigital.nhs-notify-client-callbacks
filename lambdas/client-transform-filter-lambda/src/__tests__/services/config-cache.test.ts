import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";
import {
  createClientSubscriptionConfig,
  createMessageStatusSubscription,
} from "__tests__/helpers/client-subscription-fixtures";
import { ConfigCache } from "services/config-cache";

const createConfig = (): ClientSubscriptionConfiguration =>
  createClientSubscriptionConfig("client-1", {
    subscriptions: [
      createMessageStatusSubscription(["DELIVERED"], { targetIds: [] }),
    ],
  });

describe("ConfigCache", () => {
  it("stores and retrieves configuration", () => {
    const cache = new ConfigCache(60_000);
    const config = createConfig();

    cache.set("client-1", config);

    expect(cache.get("client-1")).toEqual(config);
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
    const config = createConfig();

    cache.set("client-1", config);
    expect(cache.get("client-1")).toEqual(config);

    jest.advanceTimersByTime(1001);

    const result = cache.get("client-1");

    expect(result).toBeUndefined();

    jest.useRealTimers();
  });

  it("clears all entries", () => {
    const cache = new ConfigCache(60_000);
    const config = createConfig();

    cache.set("client-1", config);
    cache.set("client-2", config);

    expect(cache.get("client-1")).toEqual(config);
    expect(cache.get("client-2")).toEqual(config);

    cache.clear();

    expect(cache.get("client-1")).toBeUndefined();
    expect(cache.get("client-2")).toBeUndefined();
  });
});
