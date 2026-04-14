import * as cli from "src/entrypoint/cli/targets-set-mtls";
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
const mockPutClientConfig = jest.fn();
const mockFormatClientConfig = jest.fn();

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatClientConfig: (...args: unknown[]) => mockFormatClientConfig(...args),
}));

const target = createTarget();
const config = createClientSubscriptionConfig({ targets: [target] });
const mockCreateRepository = getMockCreateRepository();

describe("targets-set-mtls CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--bucket-name",
    "bucket-1",
    "--target-id",
    target.targetId,
  ];

  beforeEach(() => {
    mockGetClientConfig.mockReset();
    mockGetClientConfig.mockResolvedValue(config);
    mockPutClientConfig.mockReset();
    mockPutClientConfig.mockResolvedValue(config);
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({
      getClientConfig: mockGetClientConfig,
      putClientConfig: mockPutClientConfig,
    });
    resetCliConsoleState();
    console.warn = jest.fn();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("enables mTLS with --enable flag", async () => {
    await cli.main([...baseArgs, "--enable"]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        targets: [expect.objectContaining({ mtls: { enabled: true } })],
      }),
      false,
    );
  });

  it("disables mTLS with --disable flag and emits ANSI warning", async () => {
    await cli.main([...baseArgs, "--disable"]);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Disabling mTLS"),
    );
    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        targets: [expect.objectContaining({ mtls: { enabled: false } })],
      }),
      false,
    );
  });

  it("passes dry-run to putClientConfig", async () => {
    await cli.main([...baseArgs, "--enable", "--dry-run", "true"]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.any(Object),
      true,
    );
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, [...baseArgs, "--enable"]);
  });
});
