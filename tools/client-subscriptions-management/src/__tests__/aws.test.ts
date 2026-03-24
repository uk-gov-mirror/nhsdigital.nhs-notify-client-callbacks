import {
  deriveBucketName,
  resolveBucketName,
  resolveProfile,
  resolveRegion,
} from "src/aws";

jest.mock("@aws-sdk/client-sts", () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Account: "123456789012" }),
  })),
  GetCallerIdentityCommand: jest.fn(),
}));

describe("aws", () => {
  it("resolves bucket name from explicit argument", async () => {
    await expect(resolveBucketName({ bucketName: "bucket-1" })).resolves.toBe(
      "bucket-1",
    );
  });

  it("derives bucket name from environment using STS account ID", async () => {
    await expect(
      resolveBucketName({ environment: "dev", region: "eu-west-2" }),
    ).resolves.toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
  });

  it("uses default region eu-west-2 when region is not provided", async () => {
    await expect(resolveBucketName({ environment: "dev" })).resolves.toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
  });

  it("derives bucket name correctly", () => {
    expect(deriveBucketName("123456789012", "dev", "eu-west-2")).toBe(
      "nhs-123456789012-eu-west-2-dev-callbacks-subscription-config",
    );
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
