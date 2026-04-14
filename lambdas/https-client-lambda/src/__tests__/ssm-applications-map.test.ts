import { GetParameterCommand } from "@aws-sdk/client-ssm";

import { getApplicationId, resetCache } from "services/ssm-applications-map";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-ssm", () => {
  const actual = jest.requireActual("@aws-sdk/client-ssm");
  return {
    ...actual,
    SSMClient: jest.fn().mockImplementation(() => ({
      send: (...args: unknown[]) => mockSend(...args),
    })),
  };
});

jest.mock("services/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

process.env.APPLICATIONS_MAP_PARAMETER = "/test/applications-map";

describe("getApplicationId", () => {
  beforeEach(() => {
    mockSend.mockReset();
    resetCache();
  });

  it("returns correct applicationId for a known clientId", async () => {
    mockSend.mockResolvedValue({
      Parameter: {
        Value: JSON.stringify({
          "client-1": "app-id-1",
          "client-2": "app-id-2",
        }),
      },
    });

    const result = await getApplicationId("client-1");

    expect(result).toBe("app-id-1");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(GetParameterCommand);
  });

  it("throws for unknown clientId", async () => {
    mockSend.mockResolvedValue({
      Parameter: {
        Value: JSON.stringify({ "client-1": "app-id-1" }),
      },
    });

    await expect(getApplicationId("unknown")).rejects.toThrow(
      "No applicationId found for clientId 'unknown' in SSM map",
    );
  });

  it("surfaces SSM SDK errors", async () => {
    mockSend.mockRejectedValue(new Error("SSM unavailable"));

    await expect(getApplicationId("client-1")).rejects.toThrow(
      "SSM unavailable",
    );
  });

  it("throws when APPLICATIONS_MAP_PARAMETER is not set", async () => {
    let getFn: typeof getApplicationId;
    const saved = process.env.APPLICATIONS_MAP_PARAMETER;
    delete process.env.APPLICATIONS_MAP_PARAMETER;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires synchronous require
      getFn = require("services/ssm-applications-map").getApplicationId;
    });

    await expect(getFn!("client-1")).rejects.toThrow(
      "APPLICATIONS_MAP_PARAMETER is required",
    );

    process.env.APPLICATIONS_MAP_PARAMETER = saved;
  });

  it("throws when SSM parameter value is empty", async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: undefined } });

    await expect(getApplicationId("client-1")).rejects.toThrow(
      "not found or has no value",
    );
  });

  it("throws when SSM parameter contains invalid JSON", async () => {
    mockSend.mockResolvedValue({
      Parameter: { Value: "not-json" },
    });

    await expect(getApplicationId("client-1")).rejects.toThrow(
      "contains invalid JSON",
    );
  });

  it("caches the applications map between calls", async () => {
    mockSend.mockResolvedValue({
      Parameter: {
        Value: JSON.stringify({ "client-1": "app-id-1" }),
      },
    });

    await getApplicationId("client-1");
    await getApplicationId("client-1");

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
