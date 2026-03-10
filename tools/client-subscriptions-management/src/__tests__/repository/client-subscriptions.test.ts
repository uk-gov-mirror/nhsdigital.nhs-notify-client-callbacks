import { z } from "zod";
import { ClientSubscriptionRepository } from "src/repository/client-subscriptions";
import type {
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import type { S3Repository } from "src/repository/s3";
import type { SubscriptionBuilder } from "src/domain/client-subscription-builder";

const createRepository = (
  overrides?: Partial<{
    getObject: jest.Mock;
    putRawData: jest.Mock;
    messageStatus: jest.Mock;
    channelStatus: jest.Mock;
  }>,
) => {
  const s3Repository = {
    getObject: overrides?.getObject ?? jest.fn(),
    putRawData: overrides?.putRawData ?? jest.fn(),
  } as unknown as S3Repository;

  const configurationBuilder = {
    messageStatus: overrides?.messageStatus ?? jest.fn(),
    channelStatus: overrides?.channelStatus ?? jest.fn(),
  } as unknown as SubscriptionBuilder;

  const repository = new ClientSubscriptionRepository(
    s3Repository,
    configurationBuilder,
  );

  return { repository, s3Repository, configurationBuilder };
};

describe("ClientSubscriptionRepository", () => {
  const baseTarget: MessageStatusSubscriptionConfiguration["Targets"][number] =
    {
      Type: "API",
      TargetId: "00000000-0000-4000-8000-000000000001",
      InvocationEndpoint: "https://example.com/webhook",
      InvocationMethod: "POST",
      InvocationRateLimit: 10,
      APIKey: {
        HeaderName: "x-api-key",
        HeaderValue: "secret",
      },
    };

  const messageSubscription: MessageStatusSubscriptionConfiguration = {
    SubscriptionId: "client-1",
    SubscriptionType: "MessageStatus",
    ClientId: "client-1",
    MessageStatuses: ["DELIVERED"],
    Targets: [baseTarget],
  };

  const channelSubscription: ChannelStatusSubscriptionConfiguration = {
    SubscriptionId: "client-1-SMS",
    SubscriptionType: "ChannelStatus",
    ClientId: "client-1",
    ChannelType: "SMS",
    ChannelStatuses: ["DELIVERED"],
    SupplierStatuses: ["delivered"],
    Targets: [baseTarget],
  };

  it("returns parsed subscriptions when file exists", async () => {
    const storedConfig: ClientSubscriptionConfiguration = [messageSubscription];
    const getObject = jest.fn().mockResolvedValue(JSON.stringify(storedConfig));
    const { repository } = createRepository({ getObject });

    const result = await repository.getClientSubscriptions("client-1");

    expect(result).toEqual(storedConfig);
  });

  it("returns undefined when config file is missing", async () => {
    const getObject = jest.fn().mockResolvedValue(undefined);
    const { repository } = createRepository({ getObject });

    await expect(
      repository.getClientSubscriptions("client-1"),
    ).resolves.toBeUndefined();
  });

  it("replaces existing message subscription", async () => {
    const storedConfig: ClientSubscriptionConfiguration = [
      channelSubscription,
      messageSubscription,
    ];
    const getObject = jest.fn().mockResolvedValue(JSON.stringify(storedConfig));
    const putRawData = jest.fn();
    const newMessage: MessageStatusSubscriptionConfiguration = {
      ...messageSubscription,
      MessageStatuses: ["FAILED"],
    };
    const messageStatus = jest.fn().mockReturnValue(newMessage);

    const { repository } = createRepository({
      getObject,
      putRawData,
      messageStatus,
    });

    const result = await repository.putMessageStatusSubscription({
      clientName: "Client 1",
      clientId: "client-1",
      apiKey: "secret",
      apiEndpoint: "https://example.com/webhook",
      statuses: ["FAILED"],
      rateLimit: 10,
      dryRun: false,
    });

    expect(result).toEqual([channelSubscription, newMessage]);
    expect(putRawData).toHaveBeenCalledWith(
      JSON.stringify([channelSubscription, newMessage]),
      "client_subscriptions/client-1.json",
    );
  });

  it("skips S3 write when dry run is enabled", async () => {
    const getObject = jest.fn().mockResolvedValue(undefined);
    const putRawData = jest.fn();
    const messageStatus = jest.fn().mockReturnValue(messageSubscription);

    const { repository } = createRepository({
      getObject,
      putRawData,
      messageStatus,
    });

    await repository.putMessageStatusSubscription({
      clientName: "Client 1",
      clientId: "client-1",
      apiKey: "secret",
      apiEndpoint: "https://example.com/webhook",
      statuses: ["DELIVERED"],
      rateLimit: 10,
      dryRun: true,
    });

    expect(putRawData).not.toHaveBeenCalled();
  });

  it("replaces existing channel subscription for the channel type", async () => {
    const storedConfig: ClientSubscriptionConfiguration = [
      channelSubscription,
      messageSubscription,
    ];
    const getObject = jest.fn().mockResolvedValue(JSON.stringify(storedConfig));
    const putRawData = jest.fn();
    const newChannel: ChannelStatusSubscriptionConfiguration = {
      ...channelSubscription,
      ChannelStatuses: ["FAILED"],
    };
    const channelStatus = jest.fn().mockReturnValue(newChannel);

    const { repository } = createRepository({
      getObject,
      putRawData,
      channelStatus,
    });

    const result = await repository.putChannelStatusSubscription({
      clientName: "Client 1",
      clientId: "client-1",
      apiKey: "secret",
      apiEndpoint: "https://example.com/webhook",
      channelStatuses: ["FAILED"],
      supplierStatuses: ["delivered"],
      channelType: "SMS",
      rateLimit: 10,
      dryRun: false,
    });

    expect(result).toEqual([messageSubscription, newChannel]);
    expect(putRawData).toHaveBeenCalledWith(
      JSON.stringify([messageSubscription, newChannel]),
      "client_subscriptions/client-1.json",
    );
  });

  it("skips S3 write for channel status dry run", async () => {
    const getObject = jest.fn().mockResolvedValue(undefined);
    const putRawData = jest.fn();
    const channelStatus = jest.fn().mockReturnValue(channelSubscription);

    const { repository } = createRepository({
      getObject,
      putRawData,
      channelStatus,
    });

    await repository.putChannelStatusSubscription({
      clientName: "Client 1",
      clientId: "client-1",
      apiKey: "secret",
      apiEndpoint: "https://example.com/webhook",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
      channelType: "SMS",
      rateLimit: 10,
      dryRun: true,
    });

    expect(putRawData).not.toHaveBeenCalled();
  });

  describe("validation", () => {
    it("throws validation error for invalid message status", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putMessageStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          statuses: ["INVALID_STATUS" as never],
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(z.ZodError);
    });

    it("throws validation error for missing required fields in message subscription", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putMessageStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          // @ts-expect-error Testing missing field
          statuses: undefined,
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(z.ZodError);
    });

    it("throws validation error for invalid channel type", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putChannelStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          channelStatuses: ["DELIVERED"],
          supplierStatuses: ["delivered"],
          channelType: "INVALID_CHANNEL" as never,
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(z.ZodError);
    });

    it("throws validation error for invalid channel status", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putChannelStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          channelStatuses: ["INVALID_STATUS" as never],
          supplierStatuses: ["delivered"],
          channelType: "SMS",
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(z.ZodError);
    });

    it("throws validation error for invalid supplier status", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putChannelStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          channelStatuses: ["DELIVERED"],
          supplierStatuses: ["INVALID_STATUS" as never],
          channelType: "SMS",
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(z.ZodError);
    });

    it("throws validation error when neither channelStatuses nor supplierStatuses are provided", async () => {
      const { repository } = createRepository();

      await expect(
        repository.putChannelStatusSubscription({
          clientName: "Client 1",
          clientId: "client-1",
          apiKey: "secret",
          apiEndpoint: "https://example.com/webhook",
          channelType: "SMS",
          rateLimit: 10,
          dryRun: false,
        }),
      ).rejects.toThrow(
        /at least one of channelStatuses or supplierStatuses must be provided/,
      );
    });

    it("applies default value for apiKeyHeaderName on message subscription", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined as never);
      const messageStatus = jest.fn().mockReturnValue(messageSubscription);

      const { configurationBuilder, repository } = createRepository({
        getObject,
        messageStatus,
      });

      await repository.putMessageStatusSubscription({
        clientName: "Client 1",
        clientId: "client-1",
        apiKey: "secret",
        apiEndpoint: "https://example.com/webhook",
        statuses: ["DELIVERED"],
        rateLimit: 10,
        dryRun: false,
      });

      expect(configurationBuilder.messageStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyHeaderName: "x-api-key",
        }),
      );
    });

    it("applies default value for apiKeyHeaderName on channel subscription", async () => {
      const getObject = jest.fn().mockResolvedValue(undefined as never);
      const channelStatus = jest.fn().mockReturnValue(channelSubscription);

      const { configurationBuilder, repository } = createRepository({
        getObject,
        channelStatus,
      });

      await repository.putChannelStatusSubscription({
        clientName: "Client 1",
        clientId: "client-1",
        apiKey: "secret",
        apiEndpoint: "https://example.com/webhook",
        channelStatuses: ["DELIVERED"],
        supplierStatuses: ["delivered"],
        channelType: "SMS",
        rateLimit: 10,
        dryRun: false,
      });

      expect(configurationBuilder.channelStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyHeaderName: "x-api-key",
        }),
      );
    });
  });
});
