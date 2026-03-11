const mockPutMessageStatusSubscription = jest.fn();
const mockCreateRepository = jest.fn().mockReturnValue({
  putMessageStatusSubscription: mockPutMessageStatusSubscription,
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

import * as cli from "src/entrypoint/cli/put-message-status";

describe("put-message-status CLI", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  const originalArgv = process.argv;

  beforeEach(() => {
    mockPutMessageStatusSubscription.mockReset();
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

  it("rejects non-https endpoints", async () => {
    await cli.main([
      "node",
      "script",
      "--client-name",
      "Client One",
      "--client-id",
      "client-1",
      "--api-endpoint",
      "http://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "true",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: api-endpoint must start with https://",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutMessageStatusSubscription).not.toHaveBeenCalled();
  });

  it("writes subscription and logs response", async () => {
    mockPutMessageStatusSubscription.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.main([
      "node",
      "script",
      "--client-name",
      "Client One",
      "--client-id",
      "client-1",
      "--api-endpoint",
      "https://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
      "--api-key-header-name",
      "x-api-key",
    ]);

    expect(mockPutMessageStatusSubscription).toHaveBeenCalledWith({
      clientName: "Client One",
      clientId: "client-1",
      apiEndpoint: "https://example.com",
      apiKeyHeaderName: "x-api-key",
      apiKey: "secret",
      statuses: ["DELIVERED"],
      rateLimit: 10,
      dryRun: false,
    });
    expect(console.log).toHaveBeenCalledWith(["formatted"]);
  });

  it("handles errors in runCli", async () => {
    mockResolveBucketName.mockImplementation(() => {
      throw new Error("Boom");
    });

    await cli.runCli([
      "node",
      "script",
      "--client-name",
      "Client One",
      "--client-id",
      "client-1",
      "--api-endpoint",
      "https://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(new Error("Boom"));
    expect(process.exitCode).toBe(1);
  });

  it("executes when run as main module", async () => {
    mockPutMessageStatusSubscription.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);
    const runCliSpy = jest.spyOn(cli, "runCli").mockResolvedValue();

    await cli.runIfMain(
      [
        "node",
        "script",
        "--client-name",
        "Client One",
        "--client-id",
        "client-1",
        "--api-endpoint",
        "https://example.com",
        "--api-key",
        "secret",
        "--message-statuses",
        "DELIVERED",
        "--rate-limit",
        "10",
        "--dry-run",
        "false",
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
        "--client-name",
        "Client One",
        "--client-id",
        "client-1",
        "--api-endpoint",
        "https://example.com",
        "--api-key",
        "secret",
        "--message-statuses",
        "DELIVERED",
        "--rate-limit",
        "10",
        "--dry-run",
        "false",
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
      "--client-name",
      "Client One",
      "--client-id",
      "client-1",
      "--api-endpoint",
      "https://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ];
    mockPutMessageStatusSubscription.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.runCli();

    expect(mockPutMessageStatusSubscription).toHaveBeenCalled();
  });

  it("uses default args in main when none are provided", async () => {
    process.argv = [
      "node",
      "script",
      "--client-name",
      "Client Two",
      "--client-id",
      "client-2",
      "--api-endpoint",
      "https://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ];
    mockPutMessageStatusSubscription.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.main();

    expect(mockPutMessageStatusSubscription).toHaveBeenCalled();
  });

  it("defaults client-name to client-id when not provided", async () => {
    mockPutMessageStatusSubscription.mockResolvedValue([
      { SubscriptionType: "MessageStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--api-endpoint",
      "https://example.com",
      "--api-key",
      "secret",
      "--message-statuses",
      "DELIVERED",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(mockPutMessageStatusSubscription).toHaveBeenCalledWith({
      clientName: "client-1",
      clientId: "client-1",
      apiEndpoint: "https://example.com",
      apiKeyHeaderName: "x-api-key",
      apiKey: "secret",
      statuses: ["DELIVERED"],
      rateLimit: 10,
      dryRun: false,
    });
    expect(console.log).toHaveBeenCalledWith(["formatted"]);
  });
});
