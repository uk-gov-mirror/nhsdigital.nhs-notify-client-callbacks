import { readFileSync } from "node:fs";
import path from "node:path";
import type { RedisClientType } from "redis";

// eslint-disable-next-line security/detect-non-literal-fs-filename
const ADMIT_LUA = readFileSync(
  path.join(__dirname, "lua", "admit.lua"),
  "utf8",
);

// eslint-disable-next-line security/detect-non-literal-fs-filename
const RECORD_RESULT_LUA = readFileSync(
  path.join(__dirname, "lua", "record-result.lua"),
  "utf8",
);

export type AdmitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "circuit_open" | "rate_limited";
      retryAfterMs: number;
    };

export type RecordResultOutcome =
  | { ok: true; state: "closed" }
  | { ok: false; state: "opened" | "failed" };

export type Outcome = "success" | "failure";

export interface EndpointGateConfig {
  capacity: number;
  refillPerSec: number;
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: EndpointGateConfig = {
  capacity: 100,
  refillPerSec: 20,
  failureThreshold: 5,
  cooldownMs: 30_000,
};

export class EndpointGate {
  private readonly config: EndpointGateConfig;

  constructor(
    private readonly redis: RedisClientType,
    private readonly endpoint: string,
    config: Partial<EndpointGateConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private cbKey(): string {
    return `cb:{${this.endpoint}}`;
  }

  private rlKey(): string {
    return `rl:{${this.endpoint}}`;
  }

  async admit(): Promise<AdmitResult> {
    const raw = (await this.redis.eval(ADMIT_LUA, {
      keys: [this.cbKey(), this.rlKey()],
      arguments: [
        String(Date.now()),
        String(this.config.capacity),
        String(this.config.refillPerSec),
        String(this.config.cooldownMs),
      ],
    })) as [number, string, number];

    if (Number(raw[0]) === 1) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: raw[1] as "circuit_open" | "rate_limited",
      retryAfterMs: Number(raw[2] ?? 0),
    };
  }

  async recordResult(outcome: Outcome): Promise<RecordResultOutcome> {
    const raw = (await this.redis.eval(RECORD_RESULT_LUA, {
      keys: [this.cbKey()],
      arguments: [
        String(Date.now()),
        outcome === "success" ? "1" : "0",
        String(this.config.failureThreshold),
        String(this.config.cooldownMs),
      ],
    })) as [number, string];

    if (Number(raw[0]) === 1) {
      return { ok: true, state: "closed" };
    }

    return {
      ok: false,
      state: raw[1] as "opened" | "failed",
    };
  }
}

export { ADMIT_LUA, RECORD_RESULT_LUA };
