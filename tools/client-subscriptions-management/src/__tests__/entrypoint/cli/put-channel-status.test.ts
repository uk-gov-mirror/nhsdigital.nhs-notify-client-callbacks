const mockPutChannelStatusSubscription = jest.fn();
const mockCreateRepository = jest.fn().mockReturnValue({
  putChannelStatusSubscription: mockPutChannelStatusSubscription,
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

import * as cli from "src/entrypoint/cli/put-channel-status";

describe("put-channel-status CLI", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  const originalArgv = process.argv;

  beforeEach(() => {
    mockPutChannelStatusSubscription.mockReset();
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
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
    expect(mockPutChannelStatusSubscription).not.toHaveBeenCalled();
  });

  it("rejects when neither channel-statuses nor supplier-statuses are provided", async () => {
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
      "--channel-type",
      "SMS",
      "--rate-limit",
      "10",
      "--dry-run",
      "true",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: at least one of --channel-statuses or --supplier-statuses must be provided",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutChannelStatusSubscription).not.toHaveBeenCalled();
  });

  it("writes channel subscription and logs response", async () => {
    mockPutChannelStatusSubscription.mockResolvedValue([
      { SubscriptionType: "ChannelStatus" },
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
      "--api-key-header-name",
      "x-api-key",
    ]);

    expect(mockPutChannelStatusSubscription).toHaveBeenCalledWith({
      clientName: "Client One",
      clientId: "client-1",
      apiEndpoint: "https://example.com",
      apiKeyHeaderName: "x-api-key",
      apiKey: "secret",
      channelType: "SMS",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
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
    mockPutChannelStatusSubscription.mockResolvedValue([
      { SubscriptionType: "ChannelStatus" },
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
        "--channel-statuses",
        "DELIVERED",
        "--supplier-statuses",
        "delivered",
        "--channel-type",
        "SMS",
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
        "--channel-statuses",
        "DELIVERED",
        "--supplier-statuses",
        "delivered",
        "--channel-type",
        "SMS",
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ];
    mockPutChannelStatusSubscription.mockResolvedValue([
      { SubscriptionType: "ChannelStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.runCli();

    expect(mockPutChannelStatusSubscription).toHaveBeenCalled();
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ];
    mockPutChannelStatusSubscription.mockResolvedValue([
      { SubscriptionType: "ChannelStatus" },
    ]);
    mockFormatSubscriptionFileResponse.mockReturnValue(["formatted"]);

    await cli.main();

    expect(mockPutChannelStatusSubscription).toHaveBeenCalled();
  });

  it("defaults client-name to client-id when not provided", async () => {
    mockPutChannelStatusSubscription.mockResolvedValue([
      { SubscriptionType: "ChannelStatus" },
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
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "delivered",
      "--channel-type",
      "SMS",
      "--rate-limit",
      "10",
      "--dry-run",
      "false",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(mockPutChannelStatusSubscription).toHaveBeenCalledWith({
      clientName: "client-1",
      clientId: "client-1",
      apiEndpoint: "https://example.com",
      apiKeyHeaderName: "x-api-key",
      apiKey: "secret",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: ["delivered"],
      channelType: "SMS",
      rateLimit: 10,
      dryRun: false,
    });
    expect(console.log).toHaveBeenCalledWith(["formatted"]);
  });
});
