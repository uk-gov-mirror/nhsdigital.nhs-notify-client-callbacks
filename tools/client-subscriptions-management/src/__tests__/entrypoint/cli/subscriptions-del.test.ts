import * as cli from "src/entrypoint/cli/subscriptions-del";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockDeleteSubscription = jest.fn();
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

describe("subscriptions-del CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--subscription-id",
    "sub-001",
    "--bucket-name",
    "bucket-1",
  ];

  beforeEach(() => {
    mockDeleteSubscription.mockReset();
    mockDeleteSubscription.mockResolvedValue(resultConfig);
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({
      deleteSubscription: mockDeleteSubscription,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("deletes subscription and logs updated config", async () => {
    await cli.main(baseArgs);

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      "client-1",
      "sub-001",
      false,
    );
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("passes dry-run flag to repository", async () => {
    await cli.main([...baseArgs, "--dry-run", "true"]);

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      "client-1",
      "sub-001",
      true,
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, baseArgs);
  });
});
