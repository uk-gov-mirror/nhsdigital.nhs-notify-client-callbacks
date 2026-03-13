/**
 * Component test for the complete handler flow including S3 config loading and
 * subscription filtering. Uses the real ConfigLoader + ConfigCache + filter pipeline
 * with a mocked S3Client.
 */
// Mock S3Client before importing the handler
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

const mockSsmSend = jest.fn();
jest.mock("@aws-sdk/client-ssm", () => {
  const actual = jest.requireActual("@aws-sdk/client-ssm");
  return {
    ...actual,
    SSMClient: jest.fn().mockImplementation(() => ({
      send: mockSsmSend,
    })),
  };
});

jest.mock("aws-embedded-metrics", () => ({
  createMetricsLogger: jest.fn(() => ({
    setNamespace: jest.fn(),
    setDimensions: jest.fn(),
    putMetric: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined as unknown),
  })),
  Unit: {
    Count: "Count",
    Milliseconds: "Milliseconds",
  },
}));

import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import type { SQSRecord } from "aws-lambda";
import { EventTypes } from "@nhs-notify-client-callbacks/models";
import { createS3Client } from "services/config-loader-service";
import { applicationsMapService, configLoaderService, handler } from "..";

const makeSqsRecord = (body: object): SQSRecord => ({
  messageId: "sqs-id",
  receiptHandle: "receipt",
  body: JSON.stringify(body),
  attributes: {
    ApproximateReceiveCount: "1",
    SentTimestamp: "1519211230",
    SenderId: "ABCDEFGHIJ",
    ApproximateFirstReceiveTimestamp: "1519211230",
  },
  messageAttributes: {},
  md5OfBody: "md5",
  eventSource: "aws:sqs",
  eventSourceARN: "arn:aws:sqs:eu-west-2:123456789:queue",
  awsRegion: "eu-west-2",
});

const createValidConfig = (clientId: string) => [
  {
    SubscriptionId: "00000000-0000-0000-0000-000000000001",
    ClientId: clientId,
    Targets: [
      {
        Type: "API",
        TargetId: "00000000-0000-4000-8000-000000000001",
        InvocationEndpoint: "https://example.com/webhook",
        InvocationMethod: "POST",
        InvocationRateLimit: 10,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "secret",
        },
      },
    ],
    SubscriptionType: "MessageStatus",
    MessageStatuses: ["DELIVERED", "FAILED"],
  },
];

const validMessageStatusEvent = (clientId: string, messageStatus: string) => ({
  specversion: "1.0",
  id: "event-id",
  source: "/nhs/england/notify/development/primary/data-plane/client-callbacks",
  subject: `customer/test/message/msg-123`,
  type: EventTypes.MESSAGE_STATUS_PUBLISHED,
  time: "2025-01-01T10:00:00.000Z",
  datacontenttype: "application/json",
  dataschema: "https://nhs.uk/schemas/notify/message-status-data.v1.json",
  traceparent: "00-4d678967f96e353c07a0a31c1849b500-07f83ba58dd8df70-01",
  data: {
    messageId: "msg-123",
    messageReference: "ref-123",
    messageStatus,
    channels: [{ type: "NHSAPP", channelStatus: "DELIVERED" }],
    timestamp: "2025-01-01T10:00:00Z",
    routingPlan: {
      id: "plan-id",
      name: "plan-name",
      version: "1",
      createdDate: "2025-01-01T10:00:00Z",
    },
    clientId,
  },
});

describe("Lambda handler with S3 subscription filtering", () => {
  beforeAll(() => {
    process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET = "test-bucket";
    process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = "client_subscriptions/";
    process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS = "60";
    process.env.METRICS_NAMESPACE = "test-namespace";
    process.env.ENVIRONMENT = "test";
    process.env.APPLICATIONS_MAP_PARAMETER = "/test/applications-map";
  });

  const applicationsMap = JSON.stringify({
    "client-1": "app-id-1",
    "client-a": "app-id-a",
    "client-b": "app-id-b",
    "client-no-config": "app-id-no-config",
  });

  beforeEach(() => {
    mockSend.mockClear();
    mockSsmSend.mockClear();
    applicationsMapService.reset();
    mockSsmSend.mockResolvedValue({ Parameter: { Value: applicationsMap } });
    // Reset loader and clear cache for clean state between tests
    configLoaderService.reset(
      createS3Client({ AWS_ENDPOINT_URL: "http://localhost:4566" }),
    );
  });

  afterAll(() => {
    configLoaderService.reset();
    delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    delete process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;
    delete process.env.CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS;
    delete process.env.METRICS_NAMESPACE;
    delete process.env.ENVIRONMENT;
    delete process.env.APPLICATIONS_MAP_PARAMETER;
  });

  it("passes event through when client config matches subscription", async () => {
    mockSend.mockResolvedValue({
      Body: {
        transformToString: jest
          .fn()
          .mockResolvedValue(JSON.stringify(createValidConfig("client-1"))),
      },
    });

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-1", "DELIVERED")),
    ]);

    expect(result).toHaveLength(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(mockSsmSend).toHaveBeenCalledTimes(1);
    expect(mockSsmSend.mock.calls[0][0]).toBeInstanceOf(GetParameterCommand);
    expect(result[0].headers["x-hmac-sha256-signature"]).toMatch(/^[0-9a-f]+$/);
  });

  it("filters out event when status is not in subscription", async () => {
    mockSend.mockResolvedValue({
      Body: {
        transformToString: jest
          .fn()
          .mockResolvedValue(JSON.stringify(createValidConfig("client-1"))),
      },
    });

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-1", "CREATED")),
    ]);

    expect(result).toHaveLength(0);
  });

  it("filters out event when client has no configuration in S3", async () => {
    mockSend.mockRejectedValue(
      new NoSuchKey({ message: "Not found", $metadata: {} }),
    );

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-no-config", "DELIVERED")),
    ]);

    expect(result).toHaveLength(0);
  });

  it("passes matching events and filters non-matching in the same batch", async () => {
    // First call (client-1 DELIVERED) → match
    // Second call (client-1 CREATED) → no match
    // Both share the same client config (cached after first call)
    mockSend.mockResolvedValue({
      Body: {
        transformToString: jest
          .fn()
          .mockResolvedValue(JSON.stringify(createValidConfig("client-1"))),
      },
    });

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-1", "DELIVERED")),
      makeSqsRecord(validMessageStatusEvent("client-1", "CREATED")),
    ]);

    // Only the DELIVERED event passes the filter
    expect(result).toHaveLength(1);
    expect((result[0].data as { messageStatus: string }).messageStatus).toBe(
      "DELIVERED",
    );
  });

  it("throws when CLIENT_SUBSCRIPTION_CONFIG_BUCKET is not set", async () => {
    configLoaderService.reset();
    const originalBucket = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;

    await expect(
      handler([
        makeSqsRecord(validMessageStatusEvent("client-1", "DELIVERED")),
      ]),
    ).rejects.toThrow("CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required");

    process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET =
      originalBucket ?? "test-bucket";
  });

  it("loads configs for multiple distinct clients in parallel and deduplicates S3 fetches", async () => {
    mockSend.mockImplementation((cmd: { input: { Key: string } }) => {
      const clientId = cmd.input.Key.replace(
        "client_subscriptions/",
        "",
      ).replace(".json", "");
      return Promise.resolve({
        Body: {
          transformToString: jest
            .fn()
            .mockResolvedValue(JSON.stringify(createValidConfig(clientId))),
        },
      });
    });

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-a", "DELIVERED")),
      makeSqsRecord(validMessageStatusEvent("client-b", "DELIVERED")),
      makeSqsRecord(validMessageStatusEvent("client-a", "DELIVERED")), // duplicate client
    ]);

    // All three events match their respective configs
    expect(result).toHaveLength(3);
    // S3 fetched once per distinct client (client-a and client-b), not once per event
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("filters out event when no applicationId found in SSM map", async () => {
    mockSend.mockResolvedValue({
      Body: {
        transformToString: jest
          .fn()
          .mockResolvedValue(
            JSON.stringify(createValidConfig("client-unknown")),
          ),
      },
    });
    mockSsmSend.mockResolvedValue({
      Parameter: { Value: JSON.stringify({}) },
    });

    const result = await handler([
      makeSqsRecord(validMessageStatusEvent("client-unknown", "DELIVERED")),
    ]);

    expect(result).toHaveLength(0);
  });
});
