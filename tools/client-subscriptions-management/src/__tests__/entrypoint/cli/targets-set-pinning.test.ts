import * as cli from "src/entrypoint/cli/targets-set-pinning";
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

const target = createTarget({
  certPinning: { enabled: true, spkiHash: "existing-hash" },
});
const config = createClientSubscriptionConfig({ targets: [target] });
const mockCreateRepository = getMockCreateRepository();

describe("targets-set-pinning CLI", () => {
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
    mockGetClientConfig.mockResolvedValue(
      createClientSubscriptionConfig({
        targets: [
          createTarget({
            certPinning: { enabled: true, spkiHash: "existing-hash" },
          }),
        ],
      }),
    );
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

  it("enables certificate pinning with --enable flag", async () => {
    await cli.main([...baseArgs, "--enable"]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            certPinning: { enabled: true, spkiHash: "existing-hash" },
          }),
        ],
      }),
      false,
    );
  });

  it("disables pinning with --disable flag and emits ANSI warning", async () => {
    await cli.main([...baseArgs, "--disable"]);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Disabling certificate pinning"),
    );
    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            certPinning: { enabled: false, spkiHash: "existing-hash" },
          }),
        ],
      }),
      false,
    );
  });

  it("preserves existing spkiHash when disabling", async () => {
    await cli.main([...baseArgs, "--disable"]);

    const putCall = mockPutClientConfig.mock.calls[0];
    const updatedTarget = putCall[1].targets[0];
    expect(updatedTarget.certPinning.spkiHash).toBe("existing-hash");
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

  it("throws when enabling pinning but target has no spkiHash", async () => {
    expect.hasAssertions();
    mockGetClientConfig.mockResolvedValue(
      createClientSubscriptionConfig({
        targets: [
          createTarget({
            certPinning: { enabled: false },
          }),
        ],
      }),
    );

    await expectWrappedCliError(
      cli.main,
      [...baseArgs, "--enable"],
      `Target '${target.targetId}' has no SPKI hash stored. Run 'targets-set-certificate' first to configure a certificate hash before enabling pinning.`,
    );
  });
});
