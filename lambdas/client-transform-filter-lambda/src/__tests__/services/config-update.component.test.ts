import { S3Client } from "@aws-sdk/client-s3";
import { ConfigCache } from "services/config-cache";
import { ConfigLoader } from "services/config-loader";

describe("config update component", () => {
  it("reloads configuration after cache expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T10:00:00Z"));

    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue(
            JSON.stringify([
              {
                SubscriptionId: "00000000-0000-0000-0000-000000000001",
                ClientId: "client-1",
                Targets: [
                  {
                    Type: "API",
                    TargetId: "target",
                    InvocationEndpoint: "https://example.com",
                    InvocationMethod: "POST",
                    InvocationRateLimit: 10,
                    APIKey: {
                      HeaderName: "x-api-key",
                      HeaderValue: "secret",
                    },
                  },
                ],
                SubscriptionType: "MessageStatus",
                MessageStatuses: ["DELIVERED"],
              },
            ]),
          ),
        },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToString: jest.fn().mockResolvedValue(
            JSON.stringify([
              {
                SubscriptionId: "00000000-0000-0000-0000-000000000001",
                ClientId: "client-1",
                Targets: [
                  {
                    Type: "API",
                    TargetId: "target",
                    InvocationEndpoint: "https://example.com",
                    InvocationMethod: "POST",
                    InvocationRateLimit: 10,
                    APIKey: {
                      HeaderName: "x-api-key",
                      HeaderValue: "secret",
                    },
                  },
                ],
                SubscriptionType: "MessageStatus",
                MessageStatuses: ["FAILED"],
              },
            ]),
          ),
        },
      });

    const loader = new ConfigLoader({
      bucketName: "bucket",
      keyPrefix: "client_subscriptions/",
      s3Client: { send } as unknown as S3Client,
      cache: new ConfigCache(1000),
    });

    const first = await loader.loadClientConfig("client-1");
    const firstMessage = first?.find(
      (subscription) => subscription.SubscriptionType === "MessageStatus",
    );
    expect(firstMessage?.MessageStatuses).toEqual(["DELIVERED"]);

    jest.advanceTimersByTime(1500);

    const second = await loader.loadClientConfig("client-1");
    const secondMessage = second?.find(
      (subscription) => subscription.SubscriptionType === "MessageStatus",
    );
    expect(secondMessage?.MessageStatuses).toEqual(["FAILED"]);

    jest.useRealTimers();
  });
});
