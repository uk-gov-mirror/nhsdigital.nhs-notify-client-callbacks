import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { ApplicationsMapService } from "services/ssm-applications-map";

jest.mock("services/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const makeSsmClient = (value: string | undefined) =>
  ({
    send: jest
      .fn()
      .mockResolvedValue(
        value === undefined ? {} : { Parameter: { Value: value } },
      ),
  }) as unknown as SSMClient;

describe("ApplicationsMapService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the applicationId for a known clientId", async () => {
    const ssmClient = makeSsmClient(
      JSON.stringify({ "client-1": "app-id-1", "client-2": "app-id-2" }),
    );
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    expect(await service.getApplicationId("client-1")).toBe("app-id-1");
  });

  it("returns undefined for an unknown clientId", async () => {
    const ssmClient = makeSsmClient(JSON.stringify({ "client-1": "app-id-1" }));
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    expect(await service.getApplicationId("unknown")).toBeUndefined();
  });

  it("loads from SSM and sends GetParameterCommand with WithDecryption", async () => {
    const ssmClient = makeSsmClient(JSON.stringify({ "client-1": "app-id-1" }));
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    await service.getApplicationId("client-1");

    expect(ssmClient.send).toHaveBeenCalledTimes(1);
    expect((ssmClient.send as jest.Mock).mock.calls[0][0]).toBeInstanceOf(
      GetParameterCommand,
    );
  });

  it("caches the map and does not call SSM again within TTL", async () => {
    const ssmClient = makeSsmClient(JSON.stringify({ "client-1": "app-id-1" }));
    const service = new ApplicationsMapService(ssmClient, "/test/param", 5000);

    await service.getApplicationId("client-1");
    await service.getApplicationId("client-1");

    expect(ssmClient.send).toHaveBeenCalledTimes(1);
  });

  it("reloads from SSM after TTL expires", async () => {
    const ssmClient = makeSsmClient(JSON.stringify({ "client-1": "app-id-1" }));
    const service = new ApplicationsMapService(ssmClient, "/test/param", 5000);

    await service.getApplicationId("client-1");
    jest.advanceTimersByTime(6000);
    await service.getApplicationId("client-1");

    expect(ssmClient.send).toHaveBeenCalledTimes(2);
  });

  it("throws when SSM parameter is missing", async () => {
    const ssmClient = makeSsmClient(undefined);
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    await expect(service.getApplicationId("client-1")).rejects.toThrow(
      "SSM parameter '/test/param' not found or has no value",
    );
  });

  it("throws when SSM parameter has empty value", async () => {
    const ssmClient = {
      send: jest.fn().mockResolvedValue({ Parameter: { Value: "" } }),
    } as unknown as SSMClient;
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    await expect(service.getApplicationId("client-1")).rejects.toThrow(
      "SSM parameter '/test/param' not found or has no value",
    );
  });

  it("throws when SSM parameter contains invalid JSON", async () => {
    const ssmClient = makeSsmClient("not valid json");
    const service = new ApplicationsMapService(ssmClient, "/test/param");

    await expect(service.getApplicationId("client-1")).rejects.toThrow(
      "SSM parameter '/test/param' contains invalid JSON",
    );
  });

  it("reset clears the cache and forces reload on next call", async () => {
    const ssmClient = makeSsmClient(JSON.stringify({ "client-1": "app-id-1" }));
    const service = new ApplicationsMapService(ssmClient, "/test/param", 5000);

    await service.getApplicationId("client-1");
    service.reset();
    await service.getApplicationId("client-1");

    expect(ssmClient.send).toHaveBeenCalledTimes(2);
  });
});
