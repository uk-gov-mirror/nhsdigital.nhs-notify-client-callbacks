import * as cli from "src/entrypoint/cli/targets-del";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockDeleteTarget = jest.fn();
const mockFormatClientConfig = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatClientConfig: (...args: unknown[]) => mockFormatClientConfig(...args),
}));

const resultConfig = createClientSubscriptionConfig();
const mockCreateRepository = getMockCreateRepository();

describe("targets-del CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--target-id",
    "00000000-0000-4000-8000-000000000001",
    "--bucket-name",
    "bucket-1",
  ];

  beforeEach(() => {
    mockDeleteTarget.mockReset();
    mockDeleteTarget.mockResolvedValue(resultConfig);
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({ deleteTarget: mockDeleteTarget });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("deletes target and logs updated config", async () => {
    await cli.main(baseArgs);

    expect(mockDeleteTarget).toHaveBeenCalledWith(
      "client-1",
      "00000000-0000-4000-8000-000000000001",
      false,
    );
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("passes dry-run flag to repository", async () => {
    await cli.main([...baseArgs, "--dry-run", "true"]);

    expect(mockDeleteTarget).toHaveBeenCalledWith(
      "client-1",
      "00000000-0000-4000-8000-000000000001",
      true,
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, baseArgs);
  });
});
