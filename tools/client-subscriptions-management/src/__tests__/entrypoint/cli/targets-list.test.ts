import * as cli from "src/entrypoint/cli/targets-list";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import {
  createClientSubscriptionConfig,
  createTarget,
} from "src/__tests__/helpers/client-subscription-fixtures";

const mockGetClientConfig = jest.fn();
const mockFormatTargetsTable = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatTargetsTable: (...args: unknown[]) => mockFormatTargetsTable(...args),
}));

const target = createTarget();
const mockCreateRepository = getMockCreateRepository();

describe("targets-list CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  beforeEach(() => {
    mockGetClientConfig.mockReset();
    mockFormatTargetsTable.mockReset();
    mockFormatTargetsTable.mockReturnValue("targets-table");
    resetMockCreateRepository({
      getClientConfig: mockGetClientConfig,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("prints targets table when config has targets", async () => {
    mockGetClientConfig.mockResolvedValue(
      createClientSubscriptionConfig({ targets: [target] }),
    );

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(mockFormatTargetsTable).toHaveBeenCalledWith([target]);
    expect(console.log).toHaveBeenCalledWith("targets-table");
  });

  it("prints message when no config exists", async () => {
    mockGetClientConfig.mockResolvedValue(undefined);

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

  it("prints message when targets is empty", async () => {
    mockGetClientConfig.mockResolvedValue(createClientSubscriptionConfig());

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.log).toHaveBeenCalledWith(
      "No targets found for client: client-1",
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
    ]);
  });
});
