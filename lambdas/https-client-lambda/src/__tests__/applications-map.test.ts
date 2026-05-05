import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { SdkStream } from "@smithy/types";

import { getApplicationId, resetCache } from "services/applications-map";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: unknown[]) => mockSend(...args),
    })),
  };
});

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

process.env.APPLICATIONS_MAP_S3_BUCKET = "test-bucket";
process.env.APPLICATIONS_MAP_S3_KEY = "test/applications-map.json";

const mockBody = (content: string) =>
  ({
    transformToString: jest.fn().mockResolvedValue(content),
  }) as unknown as SdkStream<ReadableStream>;

describe("getApplicationId", () => {
  beforeEach(() => {
    mockSend.mockReset();
    resetCache();
  });

  it("returns correct applicationId for a known clientId", async () => {
    mockSend.mockResolvedValue({
      Body: mockBody(
        JSON.stringify({ "client-1": "app-id-1", "client-2": "app-id-2" }),
      ),
    });

    const result = await getApplicationId("client-1");

    expect(result).toBe("app-id-1");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("throws for unknown clientId", async () => {
    mockSend.mockResolvedValue({
      Body: mockBody(JSON.stringify({ "client-1": "app-id-1" })),
    });

    await expect(getApplicationId("unknown")).rejects.toThrow(
      "No applicationId found for clientId 'unknown' in applications map",
    );
  });

  it("surfaces S3 SDK errors", async () => {
    mockSend.mockRejectedValue(new Error("S3 unavailable"));

    await expect(getApplicationId("client-1")).rejects.toThrow(
      "S3 unavailable",
    );
  });

  it("throws when env vars are not set", async () => {
    let getFn: typeof getApplicationId;
    const savedBucket = process.env.APPLICATIONS_MAP_S3_BUCKET;
    const savedKey = process.env.APPLICATIONS_MAP_S3_KEY;
    delete process.env.APPLICATIONS_MAP_S3_BUCKET;
    delete process.env.APPLICATIONS_MAP_S3_KEY;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires synchronous require
      getFn = require("services/applications-map").getApplicationId;
    });

    await expect(getFn!("client-1")).rejects.toThrow(
      "APPLICATIONS_MAP_S3_BUCKET and APPLICATIONS_MAP_S3_KEY are required",
    );

    process.env.APPLICATIONS_MAP_S3_BUCKET = savedBucket;
    process.env.APPLICATIONS_MAP_S3_KEY = savedKey;
  });

  it("throws when S3 object body is empty", async () => {
    mockSend.mockResolvedValue({ Body: undefined });

    await expect(getApplicationId("client-1")).rejects.toThrow("is empty");
  });

  it("throws when S3 object contains invalid JSON", async () => {
    mockSend.mockResolvedValue({
      Body: mockBody("not-json"),
    });

    await expect(getApplicationId("client-1")).rejects.toThrow(
      "contains invalid JSON",
    );
  });

  it("caches the applications map between calls", async () => {
    mockSend.mockResolvedValue({
      Body: mockBody(JSON.stringify({ "client-1": "app-id-1" })),
    });

    await getApplicationId("client-1");
    await getApplicationId("client-1");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
