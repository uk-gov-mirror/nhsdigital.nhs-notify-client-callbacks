import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3Repository } from "src/repository/s3";

describe("S3Repository", () => {
  it("returns string content from S3", async () => {
    const send = jest.fn().mockResolvedValue({
      Body: { transformToString: jest.fn().mockResolvedValue("content") },
    });
    const repository = new S3Repository("bucket", {
      send,
    } as unknown as S3Client);

    const result = await repository.getObject("key.json");

    expect(result).toBe("content");
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("throws when body is missing", async () => {
    const send = jest.fn().mockResolvedValue({});
    const repository = new S3Repository("bucket", {
      send,
    } as unknown as S3Client);

    await expect(repository.getObject("key.json")).rejects.toThrow(
      "Response body is missing",
    );
  });

  it("returns undefined when object is missing", async () => {
    const send = jest
      .fn()
      .mockRejectedValue(
        new NoSuchKey({ message: "Not found", $metadata: {} }),
      );
    const repository = new S3Repository("bucket", {
      send,
    } as unknown as S3Client);

    await expect(repository.getObject("key.json")).resolves.toBeUndefined();
  });

  it("rethrows non-NoSuchKey errors", async () => {
    const send = jest.fn().mockRejectedValue(new Error("Denied"));
    const repository = new S3Repository("bucket", {
      send,
    } as unknown as S3Client);

    await expect(repository.getObject("key.json")).rejects.toThrow("Denied");
  });

  it("writes object to S3", async () => {
    const send = jest.fn().mockResolvedValue({});
    const repository = new S3Repository("bucket", {
      send,
    } as unknown as S3Client);

    await repository.putRawData("payload", "key.json");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
  });
});
