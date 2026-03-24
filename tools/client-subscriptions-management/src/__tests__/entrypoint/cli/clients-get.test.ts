import * as cli from "src/entrypoint/cli/clients-get";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockGetClientConfig = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));

const validConfig = createClientSubscriptionConfig();
const mockCreateRepository = getMockCreateRepository();

describe("clients-get CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  beforeEach(() => {
    mockGetClientConfig.mockReset();
    resetMockCreateRepository({
      getClientConfig: mockGetClientConfig,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("prints JSON config when it exists", async () => {
    mockGetClientConfig.mockResolvedValue(validConfig);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify(validConfig, null, 2),
    );
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
