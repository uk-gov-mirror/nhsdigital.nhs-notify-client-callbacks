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

    if (entry && entry.expiresAt <= Date.now()) {
      this.cache.delete(clientId);
    }

    return this.cache.get(clientId)?.value;
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
