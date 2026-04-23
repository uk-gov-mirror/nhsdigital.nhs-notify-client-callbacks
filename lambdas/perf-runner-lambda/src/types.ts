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
};

export type ChannelStatusMixEntry = {
  weight: number;
  factory: "channelStatus";
  clientId: string;
  channelStatus: ChannelStatus;
};

export type EventMixEntry = MessageStatusMixEntry | ChannelStatusMixEntry;

export type Phase = {
  durationSecs: number;
  targetEps: number;
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

export type PerformanceResult = {
  testId: string;
  scenario: Scenario;
  startedAt: string;
  completedAt: string;
  phases: PhaseResult[];
  metrics: MetricsSnapshot[];
  deliveryMetrics: DeliveryMetricsSnapshot[];
};

export type PerfRunnerPayload = {
  testId: string;
  scenario?: Scenario;
};

export type RunnerDeps = {
  sqsClient: SQSClient;
  cloudWatchClient: CloudWatchLogsClient;
  queueUrl: string;
  logGroupName: string;
  deliveryLogGroupPrefix?: string;
};
