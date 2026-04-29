import { dumpRateLimitState, flushElastiCache } from "elasticache";
import type { ElastiCacheDeps } from "types";

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockFlushAll = jest.fn().mockResolvedValue("OK");
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockHmGet = jest.fn().mockResolvedValue([]);
let mockIsOpen = true;
let mockScanKeys: string[] = [];

jest.mock("@redis/client", () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    flushAll: mockFlushAll,
    disconnect: mockDisconnect,
    hmGet: mockHmGet,
    get isOpen() {
      return mockIsOpen;
    },
    scanIterator: jest.fn(function scanIterator() {
      return mockScanKeys[Symbol.iterator]();
    }),
  })),
}));

jest.mock("@smithy/signature-v4", () => ({
  SignatureV4: jest.fn(() => ({
    presign: jest.fn().mockResolvedValue({
      query: {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": "test-credential",
      },
    }),
  })),
}));

jest.mock("@aws-crypto/sha256-js", () => ({
  Sha256: jest.fn(),
}));

jest.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: jest.fn(() => ({})),
}));

const deps: ElastiCacheDeps = {
  endpoint: "test-cache.example.invalid",
  cacheName: "test-cache",
  iamUsername: "test-user",
  region: "eu-west-2",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsOpen = true;
  mockScanKeys = [];
});

describe("flushElastiCache", () => {
  it("connects, flushes all keys, and disconnects", async () => {
    await flushElastiCache(deps);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockFlushAll).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects even when flushAll throws", async () => {
    mockFlushAll.mockRejectedValueOnce(new Error("flush failed"));

    await expect(flushElastiCache(deps)).rejects.toThrow("flush failed");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("skips disconnect when client is not open", async () => {
    mockIsOpen = false;

    await flushElastiCache(deps);

    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});

describe("dumpRateLimitState", () => {
  it("returns empty array when no ep: keys exist", async () => {
    mockScanKeys = [];

    const result = await dumpRateLimitState(deps);

    expect(result).toEqual([]);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("returns state for each ep: key sorted alphabetically", async () => {
    mockScanKeys = ["ep:{target-b}", "ep:{target-a}"];
    mockHmGet
      .mockResolvedValueOnce([
        "1",
        "500",
        "0",
        "400",
        "20",
        "15",
        "5",
        "3",
        "1500",
      ])
      .mockResolvedValueOnce([
        "0",
        "1000",
        "5",
        "900",
        "10",
        "8",
        "2",
        "1",
        "2000",
      ]);

    const result = await dumpRateLimitState(deps);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("ep:{target-a}");
    expect(result[0].isOpen).toBe("1");
    expect(result[0].switchedAt).toBe("500");
    expect(result[0].bucketTokens).toBe("0");
    expect(result[0].bucketRefilledAt).toBe("400");
    expect(result[0].curAttempts).toBe("20");
    expect(result[0].prevAttempts).toBe("15");
    expect(result[0].curFailures).toBe("5");
    expect(result[0].prevFailures).toBe("3");
    expect(result[0].sampleTill).toBe("1500");

    expect(result[1].key).toBe("ep:{target-b}");
    expect(result[1].isOpen).toBe("0");
  });

  it("disconnects even when scan throws", async () => {
    const mockClient = {
      connect: mockConnect,
      disconnect: mockDisconnect,
      hmGet: mockHmGet,
      get isOpen() {
        return mockIsOpen;
      },
      scanIterator: jest.fn(() => {
        throw new Error("scan failed");
      }),
    };
    const { createClient } = jest.requireMock("@redis/client");
    createClient.mockReturnValueOnce(mockClient);

    await expect(dumpRateLimitState(deps)).rejects.toThrow("scan failed");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("skips disconnect when client is not open", async () => {
    mockIsOpen = false;
    mockScanKeys = [];

    await dumpRateLimitState(deps);

    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
