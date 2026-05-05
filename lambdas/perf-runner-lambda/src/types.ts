import type { SQSClient } from "@aws-sdk/client-sqs";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type {
  ChannelStatus,
  MessageStatus,
} from "@nhs-notify-client-callbacks/models";

export type MessageStatusMixEntry = {
  weight: number;
  factory: "messageStatus";
  clientId: string;
  messageStatus: MessageStatus;
  forcedStatusCode?: number;
  forcedStatusCodeUntilMs?: number;
};

export type ChannelStatusMixEntry = {
  weight: number;
  factory: "channelStatus";
  clientId: string;
  channelStatus: ChannelStatus;
  forcedStatusCode?: number;
  forcedStatusCodeUntilMs?: number;
};

export type EventMixEntry = MessageStatusMixEntry | ChannelStatusMixEntry;

export type Phase = {
  durationSecs: number;
  targetEps: number;
  eventMix?: EventMixEntry[];
};

export type Scenario = {
  phases: Phase[];
  eventMix: EventMixEntry[];
  metricsIntervalSecs: number;
};

export type PhaseResult = {
  targetEps: number;
  achievedEps: number;
  sent: number;
  durationMs: number;
};

export type MetricsSnapshot = {
  snapshotAt: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  count: number;
};

export type DeliveryMetricsSnapshot = {
  snapshotAt: number;
  deliveryCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export type CircuitBreakerSnapshot = {
  snapshotAt: number;
  intervalStartSec: number;
  intervalEndSec: number;
  circuitOpenEvents: number;
  circuitCloseEvents: number;
  admissionDeniedCircuitOpen: number;
  admissionDeniedRateLimited: number;
  deliveryAttempts: number;
  deliverySuccesses: number;
  deliveryFailures: number;
  deliveryRateLimited: number;
};

export type PerClientRateEntry = {
  timestampSec: number;
  deliveryAttempts: number;
};

export type PerClientRateTimeline = {
  clientId: string;
  entries: PerClientRateEntry[];
};

export type EndpointRateLimitState = {
  key: string;
  isOpen: string | null;
  switchedAt: string | null;
  bucketTokens: string | null;
  bucketRefilledAt: string | null;
  curAttempts: string | null;
  prevAttempts: string | null;
  curFailures: string | null;
  prevFailures: string | null;
  sampleTill: string | null;
};

export type WebhookVerificationResult = {
  receivedCallbacks: number;
  verified: boolean;
};

export type QueueDepthSample = {
  timestampMs: number;
  queues: {
    queueUrl: string;
    visible: number;
    notVisible: number;
  }[];
};

export type PerformanceResult = {
  testId: string;
  scenario: Scenario;
  startedAt: string;
  completedAt: string;
  phases: PhaseResult[];
  metrics: MetricsSnapshot[];
  deliveryMetrics: DeliveryMetricsSnapshot[];
  circuitBreakerMetrics: CircuitBreakerSnapshot[];
  perClientRateTimelines?: PerClientRateTimeline[];
  webhookVerification?: WebhookVerificationResult;
  rateLimitStateBefore?: EndpointRateLimitState[];
  rateLimitStateAfter?: EndpointRateLimitState[];
};

export type PerfRunnerPayload = {
  testId: string;
  scenario: Scenario;
  cloudWatchSettlingMs?: number;
  skipPurge?: boolean;
};

export type RunnerDeps = {
  sqsClient: SQSClient;
  cloudWatchClient: CloudWatchLogsClient;
  queueUrl: string;
  deliveryQueueUrlPrefix?: string;
  logGroupName: string;
  deliveryLogGroupPrefix?: string;
  mockWebhookLogGroup?: string;
};

export type ElastiCacheDeps = {
  endpoint: string;
  cacheName: string;
  iamUsername: string;
  region: string;
};
