import { S3Client } from "@aws-sdk/client-s3";
import { createMessageStatusConfig } from "__tests__/helpers/client-subscription-fixtures";
import { ConfigSubscriptionCache } from "@nhs-notify-client-callbacks/config-subscription-cache";
import { ConfigLoader } from "services/config-loader";

jest.mock("@nhs-notify-client-callbacks/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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

    const cache = new ConfigSubscriptionCache({
      s3Client: { send } as unknown as S3Client,
      bucketName: "bucket",
      keyPrefix: "client_subscriptions/",
      ttlMs: 1000,
    });
    const loader = new ConfigLoader(cache);

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
