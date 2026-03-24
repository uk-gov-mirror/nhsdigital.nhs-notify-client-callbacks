import { S3Client } from "@aws-sdk/client-s3";
import { createMessageStatusConfig } from "__tests__/helpers/client-subscription-fixtures";
import { ConfigCache } from "services/config-cache";
import { ConfigLoader } from "services/config-loader";

const makeConfig = (messageStatuses: string[]) =>
  createMessageStatusConfig(messageStatuses as never);

describe("config update component", () => {
  it("reloads configuration after cache expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T10:00:00Z"));

    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest
            .fn()
            .mockResolvedValue(JSON.stringify(makeConfig(["DELIVERED"]))),
        },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest
            .fn()
            .mockResolvedValue(JSON.stringify(makeConfig(["FAILED"]))),
        },
      });

    const loader = new ConfigLoader({
      bucketName: "bucket",
      keyPrefix: "client_subscriptions/",
      s3Client: { send } as unknown as S3Client,
      cache: new ConfigCache(1000),
    });

    const first = await loader.loadClientConfig("client-1");
    const firstMessage = first?.subscriptions.find(
      (subscription) => subscription.subscriptionType === "MessageStatus",
    );
    expect(firstMessage?.messageStatuses).toEqual(["DELIVERED"]);

    jest.advanceTimersByTime(1500);

    const second = await loader.loadClientConfig("client-1");
    const secondMessage = second?.subscriptions.find(
      (subscription) => subscription.subscriptionType === "MessageStatus",
    );
    expect(secondMessage?.messageStatuses).toEqual(["FAILED"]);

    jest.useRealTimers();
  });
});
