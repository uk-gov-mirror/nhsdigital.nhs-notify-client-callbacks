import type { ClientSubscriptionConfiguration } from "@nhs-notify-client-callbacks/models";

type CacheEntry = {
  value: ClientSubscriptionConfiguration;
  expiresAt: number;
};

export class ConfigCache {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get(clientId: string): ClientSubscriptionConfiguration | undefined {
    const entry = this.cache.get(clientId);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(clientId);
      return undefined;
    }

    return entry.value;
  }

  set(clientId: string, value: ClientSubscriptionConfiguration): void {
    this.cache.set(clientId, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
