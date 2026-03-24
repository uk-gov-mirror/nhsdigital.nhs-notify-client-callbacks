const mockListClientIds = jest.fn();
import * as cli from "src/entrypoint/cli/clients-list";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));

const mockCreateRepository = getMockCreateRepository();

describe("clients-list CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  beforeEach(() => {
    mockListClientIds.mockReset();
    resetMockCreateRepository({
      listClientIds: mockListClientIds,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("prints each client ID on its own line", async () => {
    mockListClientIds.mockResolvedValue(["client-a", "client-b"]);

    await cli.main(["node", "script", "--bucket-name", "bucket-1"]);

    expect(console.log).toHaveBeenCalledWith("client-a");
    expect(console.log).toHaveBeenCalledWith("client-b");
  });

  it("prints nothing when no client IDs found", async () => {
    mockListClientIds.mockResolvedValue([]);

    await cli.main(["node", "script", "--bucket-name", "bucket-1"]);

    expect(console.log).toHaveBeenCalledWith("No client IDs found");
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, [
      "node",
      "script",
      "--bucket-name",
      "bucket-1",
    ]);
  });
});
