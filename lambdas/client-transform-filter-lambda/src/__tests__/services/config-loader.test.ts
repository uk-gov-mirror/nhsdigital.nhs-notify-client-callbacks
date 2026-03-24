import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { createMessageStatusConfig } from "__tests__/helpers/client-subscription-fixtures";
import { ConfigCache } from "services/config-cache";
import { ConfigLoader } from "services/config-loader";
import { ConfigValidationError } from "services/validators/config-validator";

jest.mock("services/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockBody = (json: string) => ({
  transformToString: jest.fn().mockResolvedValue(json),
});

const createValidConfig = (clientId: string) =>
  createMessageStatusConfig(["DELIVERED"], clientId);

const createLoader = (send: jest.Mock) =>
  new ConfigLoader({
    bucketName: "bucket",
    keyPrefix: "client_subscriptions/",
    s3Client: { send } as unknown as S3Client,
    cache: new ConfigCache(60_000),
  });

describe("ConfigLoader", () => {
  it("loads and validates client configuration from S3", async () => {
    const send = jest.fn().mockResolvedValue({
      Body: mockBody(JSON.stringify(createValidConfig("client-1"))),
    });
    const loader = createLoader(send);

    const result = await loader.loadClientConfig("client-1");

    expect(result).toEqual(createValidConfig("client-1"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "bucket",
      Key: "client_subscriptions/client-1.json",
    });
  });

  it("returns cached configuration on subsequent calls", async () => {
    const send = jest.fn().mockResolvedValue({
      Body: mockBody(JSON.stringify(createValidConfig("client-1"))),
    });
    const loader = createLoader(send);

    await loader.loadClientConfig("client-1");
    await loader.loadClientConfig("client-1");

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the configuration file is missing", async () => {
    const send = jest
      .fn()
      .mockRejectedValue(
        new NoSuchKey({ message: "Not found", $metadata: {} }),
      );
    const loader = createLoader(send);

    await expect(loader.loadClientConfig("client-1")).resolves.toBeUndefined();
  });

  it("throws when configuration fails validation", async () => {
    const send = jest.fn().mockResolvedValue({
      Body: mockBody(JSON.stringify({ subscriptionType: "MessageStatus" })),
    });
    const loader = createLoader(send);

    await expect(loader.loadClientConfig("client-1")).rejects.toThrow(
      ConfigValidationError,
    );
  });

  it("throws when S3 response body is empty", async () => {
    const send = jest.fn().mockResolvedValue({});
    const loader = createLoader(send);

    await expect(loader.loadClientConfig("client-1")).rejects.toThrow(
      ConfigValidationError,
    );
  });

  it("wraps S3 errors as ConfigValidationError", async () => {
    const send = jest.fn().mockRejectedValue(new Error("S3 access denied"));
    const loader = createLoader(send);

    const error = await loader
      .loadClientConfig("client-1")
      .catch((error_) => error_);
    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.issues).toEqual([
      { path: "config", message: "S3 access denied" },
    ]);
  });

  it("wraps non-Error values thrown by S3 as ConfigValidationError", async () => {
    const send = jest.fn().mockRejectedValue("unexpected string error");
    const loader = createLoader(send);

    const error = await loader
      .loadClientConfig("client-1")
      .catch((error_) => error_);
    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error.issues).toEqual([
      { path: "config", message: "unexpected string error" },
    ]);
  });
});
