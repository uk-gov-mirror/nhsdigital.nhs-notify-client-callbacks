import * as cli from "src/entrypoint/cli/applications-map-add";
import * as helper from "src/entrypoint/cli/helper";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  resetCliConsoleState,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";

const mockAddApplication = jest.fn();
const mockFormatApplicationsMap = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createS3ApplicationsMapRepository: jest.fn(),
}));

jest.mock("src/format", () => ({
  ...jest.requireActual("src/format"),
  formatApplicationsMap: (...args: unknown[]) =>
    mockFormatApplicationsMap(...args),
}));

const mockCreateS3ApplicationsMapRepository =
  helper.createS3ApplicationsMapRepository as jest.Mock;

describe("applications-map-add CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--application-id",
    "app-1",
    "--applications-map-bucket",
    "test-bucket",
    "--applications-map-key",
    "dev/applications-map.json",
  ];

  const resultMap = new Map([["client-1", "app-1"]]);

  beforeEach(() => {
    mockAddApplication.mockReset();
    mockAddApplication.mockResolvedValue(resultMap);
    mockFormatApplicationsMap.mockReset();
    mockFormatApplicationsMap.mockReturnValue("masked-map-output");
    mockCreateS3ApplicationsMapRepository.mockReset();
    mockCreateS3ApplicationsMapRepository.mockResolvedValue({
      addApplication: mockAddApplication,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("adds application and logs output", async () => {
    await cli.main(baseArgs);

    expect(mockCreateS3ApplicationsMapRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        "client-id": "client-1",
        "application-id": "app-1",
        "applications-map-bucket": "test-bucket",
        "applications-map-key": "dev/applications-map.json",
      }),
    );
    expect(mockAddApplication).toHaveBeenCalledWith("client-1", "app-1", false);
    expect(console.log).toHaveBeenCalledWith(
      "Applications map updated for client 'client-1'.",
    );
    expect(mockFormatApplicationsMap).toHaveBeenCalledWith(resultMap);
    expect(console.log).toHaveBeenCalledWith("masked-map-output");
  });

  it("does not log application-id", async () => {
    await cli.main(baseArgs);

    const logMessages = (console.log as jest.Mock).mock.calls.flat();
    expect(logMessages).not.toContain("app-1");
  });

  it("does not log dry-run message when dry-run is false", async () => {
    await cli.main(baseArgs);

    expect(console.log).not.toHaveBeenCalledWith(
      "Dry run — no changes written to S3.",
    );
  });

  it("passes dry-run flag to repository and logs dry-run message", async () => {
    await cli.main([...baseArgs, "--dry-run"]);

    expect(mockAddApplication).toHaveBeenCalledWith("client-1", "app-1", true);
    expect(console.log).toHaveBeenCalledWith(
      "Dry run — no changes written to S3.",
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateS3ApplicationsMapRepository.mockResolvedValue({
      addApplication: jest.fn().mockRejectedValue(new Error("Boom")),
    });

    await expectWrappedCliError(cli.main, baseArgs);
  });
});
