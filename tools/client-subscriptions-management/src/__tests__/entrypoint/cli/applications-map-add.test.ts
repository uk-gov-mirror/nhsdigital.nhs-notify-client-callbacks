import * as cli from "src/entrypoint/cli/applications-map-add";
import * as helper from "src/entrypoint/cli/helper";

const mockFormatApplicationsMap = jest.fn();
jest.mock("src/entrypoint/cli/helper", () => {
  const actual = jest.requireActual("src/entrypoint/cli/helper");
  return {
    ...actual,
    createS3ApplicationsMapRepository: jest.fn(),
  };
});
jest.mock("src/format", () => ({
  formatApplicationsMap: (...args: unknown[]) =>
    mockFormatApplicationsMap(...args),
}));

const mockCreateS3ApplicationsMapRepository =
  helper.createS3ApplicationsMapRepository as jest.Mock;

describe("applications-map-add CLI", () => {
  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "test-client",
    "--application-id",
    "app-123",
    "--environment",
    "dev",
  ];

  beforeEach(() => {
    mockCreateS3ApplicationsMapRepository.mockReset();
    mockFormatApplicationsMap.mockReset();
    mockCreateS3ApplicationsMapRepository.mockResolvedValue({
      addApplication: jest
        .fn()
        .mockResolvedValue(new Map([["test-client", "app-123"]])),
    });
    mockFormatApplicationsMap.mockReturnValue("formatted-output");
  });

  it("adds an application mapping", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await cli.main(baseArgs);

    expect(mockCreateS3ApplicationsMapRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        "client-id": "test-client",
        "application-id": "app-123",
        environment: "dev",
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Applications map updated for client 'test-client'.",
    );
    consoleSpy.mockRestore();
  });

  it("shows dry-run message when --dry-run is set", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await cli.main([...baseArgs, "--dry-run"]);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Dry run — no changes written to S3.",
    );
    consoleSpy.mockRestore();
  });
});
