import path from "node:path";
import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import * as cli from "src/entrypoint/cli/targets-set-certificate";
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

const FIXTURE_CERT_PATH = path.join(__dirname, "../../fixtures/test-cert.pem");
const EXPECTED_SPKI_HASH = "SpGTft7LNMxLIx5s9GMAaHTo1uz4eqMtrAFws3Exs8I=";

const target = createTarget();
const config = createClientSubscriptionConfig({ targets: [target] });
const mockCreateRepository = getMockCreateRepository();

describe("targets-set-certificate CLI", () => {
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
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("extracts SPKI hash from valid PEM and stores it", async () => {
    await cli.main([...baseArgs, "--pem-file", FIXTURE_CERT_PATH]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            certPinning: expect.objectContaining({
              spkiHash: EXPECTED_SPKI_HASH,
            }),
          }),
        ],
      }),
      false,
    );
  });

  it("errors for invalid PEM file", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "cert-test-"));
    const invalidPath = path.join(tmpDir, "invalid.pem");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(invalidPath, "not-a-pem");

    await cli.main([...baseArgs, "--pem-file", invalidPath]).catch(() => {});

    expect(mockPutClientConfig).not.toHaveBeenCalled();

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    unlinkSync(invalidPath);
  });

  it("passes dry-run to putClientConfig", async () => {
    await cli.main([
      ...baseArgs,
      "--pem-file",
      FIXTURE_CERT_PATH,
      "--dry-run",
      "true",
    ]);

    expect(mockPutClientConfig).toHaveBeenCalledWith(
      "client-1",
      expect.any(Object),
      true,
    );
  });

  it("handles repository errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, [
      ...baseArgs,
      "--pem-file",
      FIXTURE_CERT_PATH,
    ]);
  });
});
