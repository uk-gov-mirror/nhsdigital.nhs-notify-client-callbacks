import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import * as cli from "src/entrypoint/cli/clients-put";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockPutClientConfig = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));

jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  readFileSync: jest.fn(),
}));

const validConfig = createClientSubscriptionConfig();
const mockCreateRepository = getMockCreateRepository();

describe("clients-put CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  beforeEach(() => {
    mockPutClientConfig.mockReset();
    resetMockCreateRepository({
      putClientConfig: mockPutClientConfig,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("rejects when neither --json nor --file provided", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: one of --json or --file is required",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("rejects when both --json and --file are provided", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify(validConfig),
      "--file",
      "config.json",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: --json and --file are mutually exclusive",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("rejects when JSON is malformed", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      "not-valid-json",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: failed to parse JSON input",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("rejects when JSON is valid but does not match config schema", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify({ not: "a valid config" }),
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: JSON does not match expected config schema",
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("rejects when clientId in config does not match --client-id", async () => {
    const mismatchedConfig = createClientSubscriptionConfig({
      clientId: "different-client",
    });
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify(mismatchedConfig),
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("does not match --client-id"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("writes config from --json input", async () => {
    mockPutClientConfig.mockResolvedValue(validConfig);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify(validConfig),
    ]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      validConfig,
      false,
    );
    expect(console.log).toHaveBeenCalledWith(
      "Config written for client: client-1",
    );
  });

  it("reads config from --file input", async () => {
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(validConfig));
    mockPutClientConfig.mockResolvedValue(validConfig);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--file",
      path.join(tmpdir(), "config.json"),
    ]);

    expect(readFileSync).toHaveBeenCalledWith(
      path.join(tmpdir(), "config.json"),
      "utf8",
    );
    expect(mockPutClientConfig).toHaveBeenCalledTimes(1);
  });

  it("rejects non-json --file path", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--file",
      "config.txt",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: --file must be a .json path",
    );
    expect(process.exitCode).toBe(1);
    expect(readFileSync).not.toHaveBeenCalled();
    expect(mockPutClientConfig).not.toHaveBeenCalled();
  });

  it("prints dry-run output and does not log success message", async () => {
    mockPutClientConfig.mockResolvedValue(validConfig);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify(validConfig),
      "--dry-run",
      "true",
    ]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      validConfig,
      true,
    );
    expect(console.log).toHaveBeenCalledWith("Dry run: config is valid");
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify(validConfig, null, 2),
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, [
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--json",
      JSON.stringify(validConfig),
    ]);
  });
});
