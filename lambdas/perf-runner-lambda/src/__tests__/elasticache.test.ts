import { flushElastiCache } from "elasticache";
import type { ElastiCacheDeps } from "types";

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockFlushAll = jest.fn().mockResolvedValue("OK");
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
let mockIsOpen = true;

jest.mock("@redis/client", () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    flushAll: mockFlushAll,
    disconnect: mockDisconnect,
    get isOpen() {
      return mockIsOpen;
    },
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
