import * as cli from "src/entrypoint/cli/targets-add";
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

const mockAddTarget = jest.fn();
const mockBuildTarget = jest.fn();
const mockFormatClientConfig = jest.fn();

jest.mock("src/domain/client-subscription-builder", () => ({
  buildTarget: (...args: unknown[]) => mockBuildTarget(...args),
}));

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatClientConfig: (...args: unknown[]) => mockFormatClientConfig(...args),
}));

const builtTarget = createTarget();

const resultConfig = createClientSubscriptionConfig({
  targets: [builtTarget],
});
const mockCreateRepository = getMockCreateRepository();

describe("targets-add CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--bucket-name",
    "bucket-1",
    "--api-endpoint",
    "https://example.com/webhook",
    "--api-key",
    "secret",
    "--rate-limit",
    "10",
  ];

  beforeEach(() => {
    mockAddTarget.mockReset();
    mockAddTarget.mockResolvedValue(resultConfig);
    mockBuildTarget.mockReset();
    mockBuildTarget.mockReturnValue(builtTarget);
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({ addTarget: mockAddTarget });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("adds target and logs config", async () => {
    await cli.main(baseArgs);

    expect(mockBuildTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        apiEndpoint: "https://example.com/webhook",
        apiKey: "secret",
        rateLimit: 10,
      }),
    );
    expect(mockAddTarget).toHaveBeenCalledWith("client-1", builtTarget, false);
    expect(console.log).toHaveBeenCalledWith(
      `Target added with ID: ${builtTarget.targetId}`,
    );
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("passes dry-run to repository", async () => {
    await cli.main([...baseArgs, "--dry-run", "true"]);

    expect(mockAddTarget).toHaveBeenCalledWith("client-1", builtTarget, true);
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, baseArgs);
  });
});
