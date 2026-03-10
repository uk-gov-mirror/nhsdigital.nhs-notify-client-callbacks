const mockGetClientSubscriptions = jest.fn();
const mockCreateRepository = jest.fn().mockReturnValue({
  getClientSubscriptions: mockGetClientSubscriptions,
});
const mockFormatSubscriptionFileResponse = jest.fn();
const mockResolveBucketName = jest.fn().mockReturnValue("bucket");
const mockResolveProfile = jest.fn().mockReturnValue(undefined);
const mockResolveRegion = jest.fn().mockReturnValue("region");

jest.mock("src/container", () => ({
  createClientSubscriptionRepository: mockCreateRepository,
}));

jest.mock("src/entrypoint/cli/helper", () => ({
  formatSubscriptionFileResponse: mockFormatSubscriptionFileResponse,
  resolveBucketName: mockResolveBucketName,
  resolveProfile: mockResolveProfile,
  resolveRegion: mockResolveRegion,
}));

import * as cli from "src/entrypoint/cli/get-client-subscriptions";

describe("get-client-subscriptions CLI", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  const originalArgv = process.argv;

  beforeEach(() => {
    mockGetClientSubscriptions.mockReset();
    mockFormatSubscriptionFileResponse.mockReset();
    mockResolveBucketName.mockReset();
    mockResolveBucketName.mockReturnValue("bucket");
    mockResolveRegion.mockReset();
    mockResolveRegion.mockReturnValue("region");
    console.log = jest.fn();
    console.error = jest.fn();
    delete process.exitCode;
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
  });

  it("prints formatted config when subscription exists", async () => {
    mockGetClientSubscriptions.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(mockCreateRepository).toHaveBeenCalled();
    expect(mockGetClientSubscriptions).toHaveBeenCalledWith("client-1");
    expect(console.log).toHaveBeenCalledWith(["formatted"]);
  });

  it("prints message when no configuration exists", async () => {
    mockGetClientSubscriptions.mockResolvedValue(undefined);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.log).toHaveBeenCalledWith(
      "No configuration exists for client: client-1",
    );
  });

  it("handles errors in runCli", async () => {
    mockResolveBucketName.mockImplementation(() => {
      throw new Error("Boom");
    });

    await cli.runCli([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(new Error("Boom"));
    expect(process.exitCode).toBe(1);
  });

  it("executes when run as main module", async () => {
    mockGetClientSubscriptions.mockResolvedValue(undefined);
    const runCliSpy = jest.spyOn(cli, "runCli").mockResolvedValue();

    await cli.runIfMain(
      [
        "node",
        "script",
        "--client-id",
        "client-1",
        "--bucket-name",
        "bucket-1",
      ],
      true,
    );

    expect(runCliSpy).toHaveBeenCalled();
    runCliSpy.mockRestore();
  });

  it("does not execute when not main module", async () => {
    const runCliSpy = jest.spyOn(cli, "runCli").mockResolvedValue();

    await cli.runIfMain(
      [
        "node",
        "script",
        "--client-id",
        "client-1",
        "--bucket-name",
        "bucket-1",
      ],
      false,
    );

    expect(runCliSpy).not.toHaveBeenCalled();
    runCliSpy.mockRestore();
  });

  it("uses process.argv when no args are provided", async () => {
    process.argv = [
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ];
    mockGetClientSubscriptions.mockResolvedValue(undefined);

    await cli.runCli();

    expect(mockGetClientSubscriptions).toHaveBeenCalledWith("client-1");
  });

  it("uses default args in main when none are provided", async () => {
    process.argv = [
      "node",
      "script",
      "--client-id",
      "client-2",
      "--bucket-name",
      "bucket-2",
    ];
    mockGetClientSubscriptions.mockResolvedValue(undefined);

    await cli.main();

    expect(mockGetClientSubscriptions).toHaveBeenCalledWith("client-2");
  });
});
