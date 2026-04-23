import type { Scenario } from "types";

export const DEFAULT_SCENARIO: Scenario = {
  phases: [
    { durationSecs: 15, targetEps: 1000 },
    { durationSecs: 15, targetEps: 2000 },
    { durationSecs: 30, targetEps: 3000 },
  ],
  eventMix: [
    // perf-client-1: all message statuses → all subscription paths exercised
    {
      weight: 4,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "DELIVERED",
    },
    {
      weight: 2,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "FAILED",
    },
    {
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "SENDING",
    },
    {
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-1",
      messageStatus: "PENDING_ENRICHMENT",
    },
    // perf-client-2: channel status events
    {
      weight: 3,
      factory: "channelStatus",
      clientId: "perf-client-2",
      channelStatus: "DELIVERED",
    },
    {
      weight: 1,
      factory: "channelStatus",
      clientId: "perf-client-2",
      channelStatus: "FAILED",
    },
    {
      weight: 1,
      factory: "channelStatus",
      clientId: "perf-client-2",
      channelStatus: "RETRY",
    },
    // perf-client-3: DELIVERED matches (fan-out to 2 targets); SENDING is filtered
    {
      weight: 2,
      factory: "messageStatus",
      clientId: "perf-client-3",
      messageStatus: "DELIVERED",
    },
    {
      weight: 1,
      factory: "messageStatus",
      clientId: "perf-client-3",
      messageStatus: "SENDING",
    },
    // perf-client-4: mixed message + channel status
    {
      weight: 2,
      factory: "messageStatus",
      clientId: "perf-client-4",
      messageStatus: "DELIVERED",
    },
    {
      weight: 1,
      factory: "channelStatus",
      clientId: "perf-client-4",
      channelStatus: "DELIVERED",
    },
  ],
  metricsIntervalSecs: 15,
};
