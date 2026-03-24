import * as cli from "src/entrypoint/cli/subscriptions-set-states";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockSetSubscriptionStates = jest.fn();
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

describe("subscriptions-set-states CLI", () => {
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
    mockSetSubscriptionStates.mockReset();
    mockSetSubscriptionStates.mockResolvedValue(resultConfig);
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({
      setSubscriptionStates: mockSetSubscriptionStates,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("rejects when no statuses provided", async () => {
    await cli.main(baseArgs);

    expect(console.error).toHaveBeenCalledWith(
      "Error: at least one of --message-statuses, --channel-statuses, or --supplier-statuses must be provided",
    );
    expect(process.exitCode).toBe(1);
    expect(mockSetSubscriptionStates).not.toHaveBeenCalled();
  });

  it("updates message statuses and logs config", async () => {
    await cli.main([...baseArgs, "--message-statuses", "DELIVERED", "FAILED"]);

    expect(mockSetSubscriptionStates).toHaveBeenCalledWith(
      "client-1",
      "sub-001",
      expect.objectContaining({ messageStatuses: ["DELIVERED", "FAILED"] }),
      false,
    );
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("updates channel and supplier statuses", async () => {
    await cli.main([
      ...baseArgs,
      "--channel-statuses",
      "DELIVERED",
      "--supplier-statuses",
      "read",
    ]);

    expect(mockSetSubscriptionStates).toHaveBeenCalledWith(
      "client-1",
      "sub-001",
      expect.objectContaining({
        channelStatuses: ["DELIVERED"],
        supplierStatuses: ["read"],
      }),
      false,
    );
  });

  it("passes dry-run flag to repository", async () => {
    await cli.main([
      ...baseArgs,
      "--message-statuses",
      "DELIVERED",
      "--dry-run",
      "true",
    ]);

    expect(mockSetSubscriptionStates).toHaveBeenCalledWith(
      "client-1",
      "sub-001",
      expect.any(Object),
      true,
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, [
      ...baseArgs,
      "--message-statuses",
      "DELIVERED",
    ]);
  });
});
