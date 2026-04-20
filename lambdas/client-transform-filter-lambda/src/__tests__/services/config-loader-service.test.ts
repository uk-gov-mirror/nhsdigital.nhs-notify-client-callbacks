import { S3Client } from "@aws-sdk/client-s3";
import { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";
import { ConfigLoader } from "services/config-loader";
import {
  ConfigLoaderService,
  createS3Client,
  resolveCacheTtlMs,
} from "services/config-loader-service";

const mockS3Client = jest.mocked(S3Client);
const mockConfigLoader = jest.mocked(ConfigLoader);
const mockConfigSubscriptionCache = jest.mocked(ConfigSubscriptionCache);

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(),
}));

jest.mock("services/config-loader", () => ({
  ConfigLoader: jest.fn(),
}));

jest.mock("@nhs-notify-client-callbacks/config-subscription-cache", () => ({
  ConfigSubscriptionCache: jest.fn().mockImplementation(() => ({
    reset: jest.fn(),
  })),
}));

describe("ConfigLoaderService", () => {
  const originalBucket = process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
  const originalPrefix = process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;

  beforeEach(() => {
    mockConfigLoader.mockClear();
    mockConfigSubscriptionCache.mockClear();
    process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET = "test-bucket";
  });

  afterEach(() => {
    if (originalBucket === undefined) {
      delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
    } else {
      process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET = originalBucket;
    }

    if (originalPrefix === undefined) {
      delete process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;
    } else {
      process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = originalPrefix;
    }
  });

  describe("getLoader", () => {
    it("returns the same loader instance on subsequent calls (lazy singleton)", () => {
      const service = new ConfigLoaderService();
      const first = service.getLoader();
      const second = service.getLoader();
      expect(first).toBe(second);
    });

    it("throws when CLIENT_SUBSCRIPTION_CONFIG_BUCKET is not set", () => {
      delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
      const service = new ConfigLoaderService();
      expect(() => service.getLoader()).toThrow(
        "CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required",
      );
    });

    it("uses the default key prefix when CLIENT_SUBSCRIPTION_CONFIG_PREFIX is not set", () => {
      delete process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX;
      const service = new ConfigLoaderService();
      service.getLoader();
      expect(mockConfigSubscriptionCache).toHaveBeenCalledWith(
        expect.objectContaining({ keyPrefix: "client_subscriptions/" }),
      );
    });

    it("uses the configured key prefix when CLIENT_SUBSCRIPTION_CONFIG_PREFIX is set", () => {
      process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = "custom_prefix/";
      const service = new ConfigLoaderService();
      service.getLoader();
      expect(mockConfigSubscriptionCache).toHaveBeenCalledWith(
        expect.objectContaining({ keyPrefix: "custom_prefix/" }),
      );
    });
  });

  describe("reset", () => {
    it("clears the cached loader so a new one is created on next getLoader call", () => {
      const service = new ConfigLoaderService();
      const before = service.getLoader();
      service.reset();
      const after = service.getLoader();
      expect(after).not.toBe(before);
    });

    it("initialises a new loader with a custom S3Client when provided", () => {
      const customClient = createS3Client({
        AWS_ENDPOINT_URL: "http://localhost:4566",
      });
      const service = new ConfigLoaderService();
      service.reset(customClient);
      expect(() => service.getLoader()).not.toThrow();
    });

    it("uses the configured key prefix when CLIENT_SUBSCRIPTION_CONFIG_PREFIX is set", () => {
      process.env.CLIENT_SUBSCRIPTION_CONFIG_PREFIX = "custom_prefix/";
      const customClient = createS3Client({
        AWS_ENDPOINT_URL: "http://localhost:4566",
      });
      const service = new ConfigLoaderService();
      service.reset(customClient);
      expect(mockConfigSubscriptionCache).toHaveBeenCalledWith(
        expect.objectContaining({ keyPrefix: "custom_prefix/" }),
      );
    });

    it("throws when S3Client is provided but CLIENT_SUBSCRIPTION_CONFIG_BUCKET is not set", () => {
      delete process.env.CLIENT_SUBSCRIPTION_CONFIG_BUCKET;
      const customClient = createS3Client();
      const service = new ConfigLoaderService();
      expect(() => service.reset(customClient)).toThrow(
        "CLIENT_SUBSCRIPTION_CONFIG_BUCKET is required",
      );
    });
  });
});

describe("createS3Client", () => {
  beforeEach(() => {
    mockS3Client.mockClear();
  });

  it("sets forcePathStyle=true when endpoint contains localhost", () => {
    createS3Client({ AWS_ENDPOINT_URL: "http://localhost:4566" });

    expect(mockS3Client).toHaveBeenCalledWith({
      endpoint: "http://localhost:4566",
      forcePathStyle: true,
    });
  });

  it("does not set forcePathStyle when endpoint does not contain localhost", () => {
    createS3Client({ AWS_ENDPOINT_URL: "https://custom-s3.example.com" });

    expect(mockS3Client).toHaveBeenCalledWith({
      endpoint: "https://custom-s3.example.com",
      forcePathStyle: undefined,
    });
  });

  it("does not set forcePathStyle when endpoint is not set", () => {
    createS3Client({});

    expect(mockS3Client).toHaveBeenCalledWith({
      endpoint: undefined,
      forcePathStyle: undefined,
    });
  });
});

describe("resolveCacheTtlMs", () => {
  it("falls back to default TTL when value is not a number", () => {
    const ttlMs = resolveCacheTtlMs({
      CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS: "not-a-number",
    } as NodeJS.ProcessEnv);

    expect(ttlMs).toBe(60_000);
  });

  it("uses the configured TTL when valid", () => {
    const ttlMs = resolveCacheTtlMs({
      CLIENT_SUBSCRIPTION_CACHE_TTL_SECONDS: "120",
    } as NodeJS.ProcessEnv);

    expect(ttlMs).toBe(120_000);
  });
});
