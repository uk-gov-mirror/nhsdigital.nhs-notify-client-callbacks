import {
  GetParameterCommand,
  PutParameterCommand,
  type SSMClient,
} from "@aws-sdk/client-ssm";
import SsmApplicationsMapRepository from "src/repository/ssm-applications-map";

const createRepository = (send: jest.Mock = jest.fn()) => {
  const client = { send } as unknown as SSMClient;
  return {
    repository: new SsmApplicationsMapRepository(client, "/test/param"),
    send,
  };
};

describe("SsmApplicationsMapRepository", () => {
  describe("getApplication", () => {
    it("returns the application ID for an existing client", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Parameter: {
          Value: JSON.stringify({ "client-1": "app-1", "client-2": "app-2" }),
        },
      });

      const result = await repository.getApplication("client-1");

      expect(send).toHaveBeenCalledWith(expect.any(GetParameterCommand));
      expect(result).toBe("app-1");
    });

    it("returns undefined when the client is not in the map", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Parameter: { Value: JSON.stringify({ "other-client": "app-1" }) },
      });

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when parameter does not exist", async () => {
      const { repository, send } = createRepository();
      const error = Object.assign(new Error("not found"), {
        name: "ParameterNotFound",
      });
      send.mockRejectedValueOnce(error);

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("returns undefined when parameter has no value", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Parameter: {} });

      const result = await repository.getApplication("client-1");

      expect(result).toBeUndefined();
    });

    it("rethrows unexpected SSM errors", async () => {
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
          Parameter: {
            Value: JSON.stringify({ "existing-client": "existing-app" }),
          },
        })
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(send).toHaveBeenNthCalledWith(1, expect.any(GetParameterCommand));
      expect(send).toHaveBeenNthCalledWith(2, expect.any(PutParameterCommand));
      expect(result).toEqual(
        new Map([
          ["existing-client", "existing-app"],
          ["client-1", "app-1"],
        ]),
      );
    });

    it("starts from empty map when parameter does not exist", async () => {
      const { repository, send } = createRepository();
      const error = Object.assign(new Error("not found"), {
        name: "ParameterNotFound",
      });
      send.mockRejectedValueOnce(error).mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("starts from empty map when parameter has no value", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Parameter: {} }).mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "app-1");

      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("overwrites an existing client entry", async () => {
      const { repository, send } = createRepository();
      send
        .mockResolvedValueOnce({
          Parameter: { Value: JSON.stringify({ "client-1": "old-app" }) },
        })
        .mockResolvedValueOnce({});

      const result = await repository.addApplication("client-1", "new-app");

      expect(result).toEqual(new Map([["client-1", "new-app"]]));
    });

    it("skips the put when dry-run is true", async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Parameter: { Value: JSON.stringify({}) },
      });

      const result = await repository.addApplication("client-1", "app-1", true);

      expect(send).toHaveBeenCalledTimes(1);
      expect(result).toEqual(new Map([["client-1", "app-1"]]));
    });

    it("rethrows unexpected SSM errors", async () => {
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
