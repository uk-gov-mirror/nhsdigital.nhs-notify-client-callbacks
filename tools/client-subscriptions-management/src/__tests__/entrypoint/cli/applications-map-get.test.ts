import * as cli from "src/entrypoint/cli/applications-map-get";
import * as helper from "src/entrypoint/cli/helper";

jest.mock("src/entrypoint/cli/helper", () => {
  const actual = jest.requireActual("src/entrypoint/cli/helper");
  return {
    ...actual,
    createS3ApplicationsMapRepository: jest.fn(),
  };
});

const mockCreateS3ApplicationsMapRepository =
  helper.createS3ApplicationsMapRepository as jest.Mock;

describe("applications-map-get CLI", () => {
  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "test-client",
    "--environment",
    "dev",
  ];

  beforeEach(() => {
    mockCreateS3ApplicationsMapRepository.mockReset();
    mockCreateS3ApplicationsMapRepository.mockResolvedValue({
      getApplication: jest.fn().mockResolvedValue("app-id-123"),
    });
  });

  it("outputs the application ID for a known client", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await cli.main(baseArgs);

    expect(mockCreateS3ApplicationsMapRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        "client-id": "test-client",
        environment: "dev",
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith("app-id-123");
    consoleSpy.mockRestore();
  });

  it("throws when no mapping exists for the client", async () => {
    mockCreateS3ApplicationsMapRepository.mockResolvedValue({
      getApplication: jest.fn().mockResolvedValue(undefined),
    });

    await expect(cli.main(baseArgs)).rejects.toThrow(
      "No application mapping exists for client: test-client",
    );
  });
});
