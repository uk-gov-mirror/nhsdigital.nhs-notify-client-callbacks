import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { SdkStream } from "@smithy/types";
import S3ApplicationsMapRepository from "src/repository/s3-applications-map";

function createS3Body(content: string): {
  Body: SdkStream<Readable>;
} {
  const stream = Readable.from([content]) as SdkStream<Readable>;
  stream.transformToString = jest.fn().mockResolvedValue(content);
  return { Body: stream };
}

const createRepository = (send: jest.Mock = jest.fn()) => {
  const client = { send } as unknown as S3Client;
  return {
    repository: new S3ApplicationsMapRepository(
      client,
      "test-bucket",
      "dev/applications-map.json",
    ),
    send,
  };
};

describe("S3ApplicationsMapRepository", () => {
  describe("getApplication", () => {
    it("returns the application ID for an existing client", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce(
        createS3Body(
          JSON.stringify({ "client-1": "app-1", "client-2": "app-2" }),
        ),
      );

      const result = await repository.getApplication("client-1");

      expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
      expect(result).toBe("app-1");
    });

    it("returns undefined when the client is not in the map", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce(
        createS3Body(JSON.stringify({ "other-client": "app-1" })),
      );

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when S3 object does not exist", async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(
        new NoSuchKey({ message: "not found", $metadata: {} }),
      );

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when S3 object body is empty", async () => {
      const { repository, send } = createRepository();
      const stream = Readable.from([]) as SdkStream<Readable>;
      stream.transformToString = jest.fn().mockResolvedValue("");
      send.mockResolvedValueOnce({ Body: stream });

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("rethrows unexpected S3 errors", async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(new Error("Network failure"));

      await expect(repository.getApplication("client-1")).rejects.toThrow(
        "Network failure",
      );
    });
  });

  describe("addApplication", () => {
    it("reads existing map, merges new entry, and writes back", async () => {
      const { repository, send } = createRepository();
      send
        .mockResolvedValueOnce(
          createS3Body(JSON.stringify({ "existing-client": "existing-app" })),
        )
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(send).toHaveBeenNthCalledWith(1, expect.any(GetObjectCommand));
      expect(send).toHaveBeenNthCalledWith(2, expect.any(PutObjectCommand));
      expect(result).toEqual(
        new Map([
          ["existing-client", "existing-app"],
          ["client-1", "app-1"],
        ]),
      );
    });

    it("starts from empty map when S3 object does not exist", async () => {
      const { repository, send } = createRepository();
      send
        .mockRejectedValueOnce(
          new NoSuchKey({ message: "not found", $metadata: {} }),
        )
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("starts from empty map when S3 object body is empty", async () => {
      const { repository, send } = createRepository();
      const stream = Readable.from([]) as SdkStream<Readable>;
      stream.transformToString = jest.fn().mockResolvedValue("");
      send.mockResolvedValueOnce({ Body: stream }).mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("overwrites an existing client entry", async () => {
      const { repository, send } = createRepository();
      send
        .mockResolvedValueOnce(
          createS3Body(JSON.stringify({ "client-1": "old-app" })),
        )
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "new-app");

      expect(result).toEqual(new Map([["client-1", "new-app"]]));
    });

    it("skips the put when dry-run is true", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce(createS3Body(JSON.stringify({})));

      const result = await repository.addApplication("client-1", "app-1", true);

      expect(send).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("rethrows unexpected S3 errors", async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(new Error("Network failure"));

      await expect(
        repository.addApplication("client-1", "app-1"),
      ).rejects.toThrow("Network failure");
    });
  });
});
