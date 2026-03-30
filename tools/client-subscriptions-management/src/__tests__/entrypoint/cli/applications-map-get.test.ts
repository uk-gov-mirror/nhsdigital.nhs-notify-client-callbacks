import * as cli from "src/entrypoint/cli/applications-map-get";
import * as helper from "src/entrypoint/cli/helper";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  resetCliConsoleState,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";

const mockGetApplication = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createSsmApplicationsMapRepository: jest.fn(),
}));

const mockCreateSsmApplicationsMapRepository =
  helper.createSsmApplicationsMapRepository as jest.Mock;

describe("applications-map-get CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--parameter-name",
    "/nhs/dev/callbacks/applications-map",
  ];

  beforeEach(() => {
    mockGetApplication.mockReset();
    mockCreateSsmApplicationsMapRepository.mockReset();
    mockCreateSsmApplicationsMapRepository.mockReturnValue({
      getApplication: mockGetApplication,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("prints the application ID when mapping exists", async () => {
    mockGetApplication.mockResolvedValue("app-1");

    await cli.main(baseArgs);

    expect(mockCreateSsmApplicationsMapRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        "client-id": "client-1",
        "parameter-name": "/nhs/dev/callbacks/applications-map",
      }),
    );
    expect(mockGetApplication).toHaveBeenCalledWith("client-1");
    expect(console.log).toHaveBeenCalledWith("app-1");
  });

  it("does not log the application-id in other messages", async () => {
    mockGetApplication.mockResolvedValue("app-1");

    await cli.main(baseArgs);

    const logMessages = (console.log as jest.Mock).mock.calls.flat();
    expect(logMessages).toEqual(["app-1"]);
  });

  it("throws when no mapping exists for the client", async () => {
    expect.hasAssertions();
    mockGetApplication.mockResolvedValue(undefined);

    await expectWrappedCliError(
      cli.main,
      baseArgs,
      "No application mapping exists for client: client-1",
    );
  });

  it("handles repository errors", async () => {
    expect.hasAssertions();
    mockGetApplication.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, baseArgs);
  });
});
