import { createS3Client } from "src/aws";

const mockFromIni = jest.fn().mockReturnValue({ accessKeyId: "from-ini" });
jest.mock("@aws-sdk/credential-providers", () => ({
  fromIni: (...args: unknown[]) => mockFromIni(...args),
}));

describe("createS3Client", () => {
  it("sets forcePathStyle=true when endpoint contains localhost", () => {
    const env = { AWS_ENDPOINT_URL: "http://localhost:4566" };
    const client = createS3Client("eu-west-2", undefined, env);

    // Access the config through the client's config property
    const { config } = client as any;
    expect(config.endpoint).toBeDefined();
    expect(config.forcePathStyle).toBe(true);
  });

  it("does not set forcePathStyle=true when endpoint does not contain localhost", () => {
    const env = { AWS_ENDPOINT_URL: "https://custom-s3.example.com" };
    const client = createS3Client("eu-west-2", undefined, env);

    const { config } = client as any;
    expect(config.endpoint).toBeDefined();
    // S3Client converts undefined to false, so we just check it's not true
    expect(config.forcePathStyle).not.toBe(true);
  });

  it("does not set forcePathStyle=true when endpoint is not set", () => {
    const env = {};
    const client = createS3Client("eu-west-2", undefined, env);

    const { config } = client as any;
    // S3Client converts undefined to false, so we just check it's not true
    expect(config.forcePathStyle).not.toBe(true);
  });

  it("uses fromIni credentials when a profile is provided", () => {
    const client = createS3Client("eu-west-2", "my-profile", {});

    const { config } = client as any;
    expect(mockFromIni).toHaveBeenCalledWith({ profile: "my-profile" });
    expect(config.credentials).toBeDefined();
  });

  it("does not use fromIni credentials when profile is undefined", () => {
    mockFromIni.mockClear();
    createS3Client("eu-west-2", undefined, {});

    expect(mockFromIni).not.toHaveBeenCalled();
  });
});
