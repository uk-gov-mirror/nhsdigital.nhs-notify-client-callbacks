import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { SdkStream } from "@smithy/types";
import S3ApplicationsMapRepository from "src/repository/s3-applications-map";

const mockBody = (content: string) =>
  ({
    transformToString: jest.fn().mockResolvedValue(content),
  }) as unknown as SdkStream<ReadableStream>;

const createRepository = (send: jest.Mock = jest.fn()) => {
  const client = { send } as unknown as S3Client;
  return {
    repository: new S3ApplicationsMapRepository(
      client,
      "test-bucket",
      "test/applications-map.json",
    ),
    send,
  };
};

describe("S3ApplicationsMapRepository", () => {
  describe("getApplication", () => {
    it("returns the application ID for an existing client", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Body: mockBody(
          JSON.stringify({ "client-1": "app-1", "client-2": "app-2" }),
        ),
      });

      const result = await repository.getApplication("client-1");

      expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
      expect(result).toBe("app-1");
    });

    it("returns undefined when the client is not in the map", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Body: mockBody(JSON.stringify({ "other-client": "app-1" })),
      });

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when object does not exist", async () => {
      const { repository, send } = createRepository();
      const error = Object.assign(new Error("not found"), {
        name: "NoSuchKey",
      });
      send.mockRejectedValueOnce(error);

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when object body is empty", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Body: undefined });

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("rethrows unexpected S3 errors", async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(
        Object.assign(new Error("Network failure"), { name: "NetworkError" }),
      );

      await expect(repository.getApplication("client-1")).rejects.toThrow(
        "Network failure",
      );
    });
  });

  describe("addApplication", () => {
    it("reads existing map, merges new entry, and writes back", async () => {
      const { repository, send } = createRepository();
      send
        .mockResolvedValueOnce({
          Body: mockBody(JSON.stringify({ "existing-client": "existing-app" })),
        })
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

    it("starts from empty map when object does not exist", async () => {
      const { repository, send } = createRepository();
      const error = Object.assign(new Error("not found"), {
        name: "NoSuchKey",
      });
      send.mockRejectedValueOnce(error).mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("starts from empty map when object body is empty", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Body: undefined }).mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("overwrites an existing client entry", async () => {
      const { repository, send } = createRepository();
      send
        .mockResolvedValueOnce({
          Body: mockBody(JSON.stringify({ "client-1": "old-app" })),
        })
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "new-app");

      expect(result).toEqual(new Map([["client-1", "new-app"]]));
    });

    it("skips the put when dry-run is true", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Body: mockBody(JSON.stringify({})),
      });

      const result = await repository.addApplication("client-1", "app-1", true);

      expect(send).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("rethrows unexpected S3 errors", async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(
        Object.assign(new Error("Network failure"), { name: "NetworkError" }),
      );

      await expect(
        repository.addApplication("client-1", "app-1"),
      ).rejects.toThrow("Network failure");
    });
  });
});
