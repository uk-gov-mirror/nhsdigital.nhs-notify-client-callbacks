import { ClientSubscriptionRepository } from "src/repository/client-subscriptions";
import type {
  ClientSubscriptionConfiguration,
  MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import type { S3Repository } from "src/repository/s3";
import {
  DEFAULT_TARGET_ID as TARGET_ID,
  createChannelStatusSubscription,
  createClientSubscriptionConfig,
  createMessageStatusSubscription,
  createPopulatedClientSubscriptionConfig,
  createTarget,
} from "src/__tests__/helpers/client-subscription-fixtures";

const createRepository = (overrides?: {
  getObject?: jest.Mock;
  putRawData?: jest.Mock;
  listObjectKeys?: jest.Mock;
}) => {
  const s3Repository = {
    getObject: overrides?.getObject ?? jest.fn(),
    putRawData: overrides?.putRawData ?? jest.fn(),
    listObjectKeys: overrides?.listObjectKeys ?? jest.fn(),
  } as unknown as S3Repository;

  return {
    repository: new ClientSubscriptionRepository(s3Repository),
    s3Repository,
  };
};

const baseTarget = createTarget();
const messageSubscription = createMessageStatusSubscription();
const channelSubscription = createChannelStatusSubscription();

const baseConfig = (clientId = "client-1"): ClientSubscriptionConfiguration =>
  createPopulatedClientSubscriptionConfig(clientId);

describe("ClientSubscriptionRepository", () => {
  describe("listClientIds", () => {
    it("returns client IDs extracted from S3 object keys", async () => {
      const listObjectKeys = jest
        .fn()
        .mockResolvedValue([
          "client_subscriptions/client-a.json",
          "client_subscriptions/client-b.json",
        ]);
      const { repository } = createRepository({ listObjectKeys });

      await expect(repository.listClientIds()).resolves.toEqual([
        "client-a",
        "client-b",
      ]);
    });

    it("returns empty array when no objects found", async () => {
      const listObjectKeys = jest.fn().mockResolvedValue([]);
      const { repository } = createRepository({ listObjectKeys });

      await expect(repository.listClientIds()).resolves.toEqual([]);
    });
  });

  describe("getClientConfig", () => {
    it("returns parsed config when file exists", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const { repository } = createRepository({ getObject });

      await expect(repository.getClientConfig("client-1")).resolves.toEqual(
        config,
      );
    });

    it("returns undefined when config file is missing", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const { repository } = createRepository({ getObject });

      await expect(
        repository.getClientConfig("client-1"),
      ).resolves.toBeUndefined();
    });

    it("throws when stored config is invalid", async () => {
      const getObject = jest.fn().mockResolvedValue(
        JSON.stringify(
          createClientSubscriptionConfig({
            subscriptions: [messageSubscription],
          }),
        ),
      );
      const { repository } = createRepository({ getObject });

      await expect(repository.getClientConfig("client-1")).rejects.toThrow(
        /Config validation failed/,
      );
    });

    it("throws when stored config JSON cannot be parsed", async () => {
      const getObject = jest.fn().mockResolvedValue("{ not valid json }");
      const { repository } = createRepository({ getObject });

      await expect(repository.getClientConfig("client-1")).rejects.toThrow(
        "Failed to parse stored config for client client-1",
      );
    });
  });

  describe("putClientConfig", () => {
    it("writes config to S3 and returns it", async () => {
      const putRawData = jest.fn();
      const config = baseConfig();
      const { repository } = createRepository({ putRawData });

      const result = await repository.putClientConfig(
        "client-1",
        config,
        false,
      );

      expect(result).toEqual(config);
      expect(putRawData).toHaveBeenCalledWith(
        expect.any(String),
        "client_subscriptions/client-1.json",
      );
      expect(JSON.parse(putRawData.mock.calls[0][0] as string)).toEqual(config);
    });

    it("skips S3 write on dry run", async () => {
      const putRawData = jest.fn();
      const config = baseConfig();
      const { repository } = createRepository({ putRawData });

      await repository.putClientConfig("client-1", config, true);

      expect(putRawData).not.toHaveBeenCalled();
    });

    it("throws when config is invalid and does not write to S3", async () => {
      const putRawData = jest.fn();
      const invalidConfig = createClientSubscriptionConfig({
        subscriptions: [messageSubscription],
      }) as unknown as ClientSubscriptionConfiguration;
      const { repository } = createRepository({ putRawData });

      await expect(
        repository.putClientConfig("client-1", invalidConfig, false),
      ).rejects.toThrow(/Config validation failed/);

      expect(putRawData).not.toHaveBeenCalled();
    });
  });

  describe("addSubscription", () => {
    it("appends subscription to existing config", async () => {
      const existing = createClientSubscriptionConfig({
        subscriptions: [messageSubscription],
        targets: [baseTarget],
      });
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(existing));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.addSubscription(
        "client-1",
        channelSubscription,
        false,
      );

      expect(result.subscriptions).toHaveLength(2);
      expect(result.subscriptions[1]).toEqual(channelSubscription);
      expect(putRawData).toHaveBeenCalledTimes(1);
    });

    it("throws when resulting config would be invalid", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      await expect(
        repository.addSubscription("client-1", messageSubscription, false),
      ).rejects.toThrow(/Config validation failed/);

      expect(putRawData).not.toHaveBeenCalled();
    });
  });

  describe("deleteSubscription", () => {
    it("removes subscription by ID", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.deleteSubscription(
        "client-1",
        "sub-001",
        false,
      );

      expect(result.subscriptions).toHaveLength(1);
      expect(result.subscriptions[0].subscriptionId).toBe("sub-002");
    });

    it("throws when config not found", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const { repository } = createRepository({ getObject });

      await expect(
        repository.deleteSubscription("client-1", "sub-001", false),
      ).rejects.toThrow("No configuration found for client: client-1");
    });

    it("warns when subscription ID does not exist", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await repository.deleteSubscription(
        "client-1",
        "non-existent-id",
        false,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        "Warning: subscription non-existent-id not found for client client-1",
      );
      expect(result.subscriptions).toEqual(config.subscriptions);
      warnSpy.mockRestore();
    });
  });

  describe("setSubscriptionStates", () => {
    it("updates messageStatuses for a MessageStatus subscription", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.setSubscriptionStates(
        "client-1",
        "sub-001",
        { messageStatuses: ["FAILED"] },
        false,
      );

      const updated = result.subscriptions.find(
        (s) => s.subscriptionId === "sub-001",
      ) as MessageStatusSubscriptionConfiguration | undefined;
      expect(updated?.messageStatuses).toEqual(["FAILED"]);
    });

    it("throws when config not found", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const { repository } = createRepository({ getObject });

      await expect(
        repository.setSubscriptionStates("client-1", "sub-001", {}, false),
      ).rejects.toThrow("No configuration found for client: client-1");
    });

    it("updates channel and supplier statuses for a ChannelStatus subscription", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.setSubscriptionStates(
        "client-1",
        "sub-002",
        {
          channelStatuses: ["DELIVERED"],
          supplierStatuses: ["read"],
        },
        false,
      );

      const updated = result.subscriptions.find(
        (s) => s.subscriptionId === "sub-002",
      );

      expect(updated).toEqual(
        expect.objectContaining({
          subscriptionType: "ChannelStatus",
          channelStatuses: ["DELIVERED"],
          supplierStatuses: ["read"],
        }),
      );
    });

    it("leaves subscriptions unchanged when subscription ID does not exist", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.setSubscriptionStates(
        "client-1",
        "missing-subscription-id",
        { channelStatuses: ["FAILED"] },
        false,
      );

      expect(result.subscriptions).toEqual(config.subscriptions);
    });
  });

  describe("addTarget", () => {
    it("appends target to existing config", async () => {
      const existing = createClientSubscriptionConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(existing));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.addTarget("client-1", baseTarget, false);

      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]).toEqual(baseTarget);
    });

    it("creates new config when none exists", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.addTarget("client-1", baseTarget, false);

      expect(result.clientId).toBe("client-1");
      expect(result.targets).toEqual([baseTarget]);
    });
  });

  describe("deleteTarget", () => {
    it("removes target by ID when it is not referenced", async () => {
      const config = createClientSubscriptionConfig({ targets: [baseTarget] });
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      const result = await repository.deleteTarget(
        "client-1",
        TARGET_ID,
        false,
      );

      expect(result.targets).toHaveLength(0);
    });

    it("warns when target ID does not exist", async () => {
      const config = createClientSubscriptionConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await repository.deleteTarget(
        "client-1",
        "non-existent-target",
        false,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        "Warning: target non-existent-target not found for client client-1",
      );
      expect(result.targets).toEqual(config.targets);
      warnSpy.mockRestore();
    });

    it("throws when removing a referenced target would invalidate the config", async () => {
      const config = baseConfig();
      const getObject = jest.fn().mockResolvedValue(JSON.stringify(config));
      const putRawData = jest.fn();
      const { repository } = createRepository({ getObject, putRawData });

      await expect(
        repository.deleteTarget("client-1", TARGET_ID, false),
      ).rejects.toThrow(
        `Cannot delete target ${TARGET_ID}: still referenced by subscriptions sub-001, sub-002`,
      );

      expect(putRawData).not.toHaveBeenCalled();
    });

    it("throws when config not found", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined);
      const { repository } = createRepository({ getObject });

      await expect(
        repository.deleteTarget("client-1", TARGET_ID, false),
      ).rejects.toThrow("No configuration found for client: client-1");
    });
  });
});
