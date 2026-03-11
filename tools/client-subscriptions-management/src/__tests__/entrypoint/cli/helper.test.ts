import type {
  ChannelStatusSubscriptionConfiguration,
  ClientSubscriptionConfiguration,
  MessageStatusSubscriptionConfiguration,
} from "@nhs-notify-client-callbacks/models";
import {
  deriveBucketName,
  formatSubscriptionFileResponse,
  normalizeClientName,
  resolveBucketName,
  resolveProfile,
  resolveRegion,
} from "src/entrypoint/cli/helper";

jest.mock("@aws-sdk/client-sts", () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Account: "123456789012" }),
  })),
  GetCallerIdentityCommand: jest.fn(),
}));

describe("cli helper", () => {
  const messageSubscription: MessageStatusSubscriptionConfiguration = {
    SubscriptionId: "client-a",
    SubscriptionType: "MessageStatus",
    ClientId: "client-a",
    MessageStatuses: ["DELIVERED"],
    Targets: [
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
      },
    ],
  };

  const channelSubscription: ChannelStatusSubscriptionConfiguration = {
    SubscriptionId: "client-a-sms",
    SubscriptionType: "ChannelStatus",
    ClientId: "client-a",
    ChannelType: "SMS",
    ChannelStatuses: ["DELIVERED"],
    SupplierStatuses: ["delivered"],
    Targets: [
      {
        Type: "API",
        TargetId: "00000000-0000-4000-8000-000000000002",
        InvocationEndpoint: "https://example.com/webhook",
        InvocationMethod: "POST",
        InvocationRateLimit: 20,
        APIKey: {
          HeaderName: "x-api-key",
          HeaderValue: "secret",
        },
      },
    ],
  };

  it("formats subscription output as a table string", () => {
    const config: ClientSubscriptionConfiguration = [
      messageSubscription,
      channelSubscription,
    ];

    const result = formatSubscriptionFileResponse(config);

    expect(typeof result).toBe("string");
    // message status row
    expect(result).toContain("client-a");
    expect(result).toContain("MessageStatus");
    expect(result).toContain("DELIVERED");
    expect(result).toContain("https://example.com/webhook");
    expect(result).toContain("POST");
    expect(result).toContain("x-api-key");
    expect(result).toContain("secret");
    // channel status row
    expect(result).toContain("ChannelStatus");
    expect(result).toContain("SMS");
  });

  it("normalizes client name", () => {
    expect(normalizeClientName("My  Client Name")).toBe("my-client-name");
  });

  it("resolves bucket name from explicit argument", async () => {
    await expect(resolveBucketName("bucket-1")).resolves.toBe("bucket-1");
  });

  it("derives bucket name from environment using STS account ID", async () => {
    await expect(
      resolveBucketName(undefined, "dev", "eu-west-2"),
    ).resolves.toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
  });

  it("uses default region eu-west-2 when region is not provided", async () => {
    await expect(resolveBucketName(undefined, "dev")).resolves.toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
  });

  it("throws when neither bucket name nor environment provided", async () => {
    await expect(resolveBucketName()).rejects.toThrow(
      "Bucket name is required: use --bucket-name to specify directly, or --environment",
    );
  });

  it("derives bucket name correctly", () => {
    expect(deriveBucketName("123456789012", "dev", "eu-west-2")).toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
  });

  it("derives bucket name with custom project and component", () => {
    expect(
      deriveBucketName("123456789012", "prod", "eu-west-2", "myproj", "mycomp"),
    ).toBe("myproj-123456789012-eu-west-2-prod-mycomp-subscription-config");
  });

  it("resolves profile from argument", () => {
    expect(resolveProfile("my-profile")).toBe("my-profile");
  });

  it("resolves profile from AWS_PROFILE env", () => {
    expect(
      resolveProfile(undefined, {
        AWS_PROFILE: "env-profile",
      } as NodeJS.ProcessEnv),
    ).toBe("env-profile");
  });

  it("returns undefined when profile is not set", () => {
    expect(resolveProfile(undefined, {} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("resolves region from argument", () => {
    expect(resolveRegion("eu-west-2")).toBe("eu-west-2");
  });

  it("resolves region from AWS_REGION", () => {
    expect(
      resolveRegion(undefined, {
        AWS_REGION: "eu-west-1",
      } as NodeJS.ProcessEnv),
    ).toBe("eu-west-1");
  });

  it("resolves region from AWS_DEFAULT_REGION", () => {
    expect(
      resolveRegion(undefined, {
        AWS_DEFAULT_REGION: "eu-west-3",
      } as NodeJS.ProcessEnv),
    ).toBe("eu-west-3");
  });

  it("returns undefined when region is not set", () => {
    expect(resolveRegion(undefined, {} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
