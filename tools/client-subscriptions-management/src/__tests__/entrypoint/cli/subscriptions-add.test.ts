import * as cli from "src/entrypoint/cli/subscriptions-add";
import {
  captureCliConsoleState,
  expectWrappedCliError,
  getMockCreateRepository,
  resetCliConsoleState,
  resetMockCreateRepository,
  restoreCliConsoleState,
} from "src/__tests__/entrypoint/cli/test-utils";
import { createClientSubscriptionConfig } from "src/__tests__/helpers/client-subscription-fixtures";

const mockAddSubscription = jest.fn();
const mockBuildMessageStatusSubscription = jest.fn();
const mockBuildChannelStatusSubscription = jest.fn();
const mockFormatClientConfig = jest.fn();

jest.mock("src/domain/client-subscription-builder", () => ({
  buildMessageStatusSubscription: (...args: unknown[]) =>
    mockBuildMessageStatusSubscription(...args),
  buildChannelStatusSubscription: (...args: unknown[]) =>
    mockBuildChannelStatusSubscription(...args),
}));

jest.mock("src/entrypoint/cli/helper", () => ({
  ...jest.requireActual("src/entrypoint/cli/helper"),
  createRepository: jest.fn(),
}));
jest.mock("src/format", () => ({
  formatClientConfig: (...args: unknown[]) => mockFormatClientConfig(...args),
}));

const resultConfig = createClientSubscriptionConfig();
const mockCreateRepository = getMockCreateRepository();

describe("subscriptions-add CLI", () => {
  const originalCliConsoleState = captureCliConsoleState();

  const baseMessageArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--bucket-name",
    "bucket-1",
    "--subscription-type",
    "MessageStatus",
    "--target-id",
    "target-001",
    "--message-statuses",
    "DELIVERED",
  ];

  const baseChannelArgs = [
    "node",
    "script",
    "--client-id",
    "client-1",
    "--bucket-name",
    "bucket-1",
    "--subscription-type",
    "ChannelStatus",
    "--target-id",
    "target-001",
    "--channel-type",
    "SMS",
    "--channel-statuses",
    "DELIVERED",
  ];

  beforeEach(() => {
    mockAddSubscription.mockReset();
    mockAddSubscription.mockResolvedValue(resultConfig);
    mockBuildMessageStatusSubscription.mockReset();
    mockBuildMessageStatusSubscription.mockReturnValue({
      subscriptionId: "sub-001",
      subscriptionType: "MessageStatus",
      messageStatuses: ["DELIVERED"],
      targetIds: ["target-001"],
    });
    mockBuildChannelStatusSubscription.mockReset();
    mockBuildChannelStatusSubscription.mockReturnValue({
      subscriptionId: "sub-002",
      subscriptionType: "ChannelStatus",
      channelType: "SMS",
      channelStatuses: ["DELIVERED"],
      supplierStatuses: [],
      targetIds: ["target-001"],
    });
    mockFormatClientConfig.mockReset();
    mockFormatClientConfig.mockReturnValue("formatted-output");
    resetMockCreateRepository({
      addSubscription: mockAddSubscription,
    });
    resetCliConsoleState();
  });

  afterAll(() => {
    restoreCliConsoleState(originalCliConsoleState);
  });

  it("adds MessageStatus subscription and logs config", async () => {
    await cli.main(baseMessageArgs);

    expect(mockBuildMessageStatusSubscription).toHaveBeenCalled();
    expect(mockAddSubscription).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("rejects MessageStatus without --message-statuses", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--subscription-type",
      "MessageStatus",
      "--target-id",
      "target-001",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: --message-statuses is required for MessageStatus subscriptions",
    );
    expect(process.exitCode).toBe(1);
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("adds ChannelStatus subscription and logs config", async () => {
    await cli.main(baseChannelArgs);

    expect(mockBuildChannelStatusSubscription).toHaveBeenCalled();
    expect(mockAddSubscription).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("formatted-output");
  });

  it("rejects ChannelStatus without --channel-type", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--subscription-type",
      "ChannelStatus",
      "--target-id",
      "target-001",
      "--channel-statuses",
      "DELIVERED",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: --channel-type is required for ChannelStatus subscriptions",
    );
    expect(process.exitCode).toBe(1);
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("rejects ChannelStatus without channel or supplier statuses", async () => {
    await cli.main([
      "node",
      "script",
      "--client-id",
      "client-1",
      "--bucket-name",
      "bucket-1",
      "--subscription-type",
      "ChannelStatus",
      "--target-id",
      "target-001",
      "--channel-type",
      "SMS",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      "Error: at least one of --channel-statuses or --supplier-statuses must be provided",
    );
    expect(process.exitCode).toBe(1);
    expect(mockAddSubscription).not.toHaveBeenCalled();
  });

  it("handles errors in wrapped CLI", async () => {
    expect.hasAssertions();
    mockCreateRepository.mockRejectedValue(new Error("Boom"));

    await expectWrappedCliError(cli.main, baseMessageArgs);
  });
});
