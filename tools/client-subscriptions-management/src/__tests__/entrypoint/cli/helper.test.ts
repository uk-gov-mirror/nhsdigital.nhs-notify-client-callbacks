const mockCreateRepositoryFromOptions = jest.fn();
const mockResolveBucketName = jest.fn();
const mockResolveProfile = jest.fn();
const mockResolveRegion = jest.fn();

jest.mock("src/aws", () => ({
  createRepository: mockCreateRepositoryFromOptions,
  resolveBucketName: mockResolveBucketName,
  resolveProfile: mockResolveProfile,
  resolveRegion: mockResolveRegion,
}));

import {
  type AnyCliCommand,
  createRepository,
  runCommands,
} from "src/entrypoint/cli/helper";

describe("createRepository", () => {
  it("resolves region, profile and bucket then delegates to createRepository from aws", async () => {
    const fakeRepo = { listClientIds: jest.fn() };
    mockResolveRegion.mockReturnValue("eu-west-2");
    mockResolveProfile.mockReturnValue("my-profile");
    mockResolveBucketName.mockResolvedValue("my-bucket");
    mockCreateRepositoryFromOptions.mockReturnValue(fakeRepo);

    const result = await createRepository({
      "bucket-name": "my-bucket",
      region: "eu-west-2",
      profile: "my-profile",
      environment: "my-env",
    });

    expect(mockResolveRegion).toHaveBeenCalledWith("eu-west-2");
    expect(mockResolveProfile).toHaveBeenCalledWith("my-profile");
    expect(mockResolveBucketName).toHaveBeenCalledWith({
      bucketName: "my-bucket",
      environment: "my-env",
      region: "eu-west-2",
      profile: "my-profile",
    });
    expect(mockCreateRepositoryFromOptions).toHaveBeenCalledWith({
      bucketName: "my-bucket",
      region: "eu-west-2",
      profile: "my-profile",
    });
    expect(result).toBe(fakeRepo);
  });
});

describe("runCommands", () => {
  it("dispatches to the matching command handler", async () => {
    const mockHandler = jest.fn().mockResolvedValue(undefined);
    const command: AnyCliCommand = {
      command: "test-cmd",
      handler: mockHandler,
    };

    await runCommands([command], ["node", "script", "test-cmd"]);

    expect(mockHandler).toHaveBeenCalled();
  });
});
