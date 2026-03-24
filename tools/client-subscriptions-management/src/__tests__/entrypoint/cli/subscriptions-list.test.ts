import * as cli from "src/entrypoint/cli/subscriptions-list";
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
  createMessageStatusSubscription,
} from "src/__tests__/helpers/client-subscription-fixtures";

const mockGetClientConfig = jest.fn();
const mockFormatSubscriptionsTable = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatSubscriptionsTable: (...args: unknown[]) =>
    mockFormatSubscriptionsTable(...args),
}));

const validConfig = createClientSubscriptionConfig({
  subscriptions: [
    createMessageStatusSubscription({
      targetIds: ["target-001"],
    }),
  ],
});
const mockCreateRepository = getMockCreateRepository();

describe("subscriptions-list CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  beforeEach(() => {
    mockGetClientConfig.mockReset();
    mockFormatSubscriptionsTable.mockReset();
    mockFormatSubscriptionsTable.mockReturnValue("table-output");
    resetMockCreateRepository({
      getClientConfig: mockGetClientConfig,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("prints subscriptions table when config has subscriptions", async () => {
    mockGetClientConfig.mockResolvedValue(validConfig);

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(mockFormatSubscriptionsTable).toHaveBeenCalledWith(
      validConfig.subscriptions,
    );
    expect(console.log).toHaveBeenCalledWith("table-output");
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

  it("prints message when subscriptions is empty", async () => {
    mockGetClientConfig.mockResolvedValue({
      ...validConfig,
      subscriptions: [],
    });

    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
    ]);

    expect(console.log).toHaveBeenCalledWith(
      "No subscriptions found for client: client-1",
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
