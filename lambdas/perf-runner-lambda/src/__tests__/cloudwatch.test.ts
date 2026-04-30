import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  queryCircuitBreakerSnapshot,
  queryDeliveryMetricsSnapshot,
  queryMetricsSnapshot,
  queryPerClientRateTimeline,
} from "cloudwatch";

const mockCloudWatchClient = {
  send: jest.fn(),
} as unknown as jest.Mocked<CloudWatchLogsClient>;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("queryMetricsSnapshot", () => {
  it("returns null when StartQuery returns no queryId", async () => {
    mockCloudWatchClient.send.mockResolvedValueOnce({} as never);

    const result = await queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/nhs-dev-cb-client-transform-filter",
      1_700_000_000,
      1_700_000_060,
    );

    expect(result).toBeNull();
  });

  it("returns null when the query status is Failed", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-1" } as never)
      .mockResolvedValueOnce({ status: "Failed" } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when the query status is Cancelled", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-2" } as never)
      .mockResolvedValueOnce({ status: "Cancelled" } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns a snapshot with zeroed metrics when the result row is empty", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-3" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ p50Ms: 0, p95Ms: 0, p99Ms: 0, count: 0 });
    expect(result?.snapshotAt).toBeGreaterThan(0);
  });

  it("returns a populated snapshot when query completes successfully", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-4" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "eventCount", value: "500" },
            { field: "p50", value: "42" },
            { field: "p95", value: "120" },
            { field: "p99", value: "250" },
          ],
        ],
      } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      count: 500,
      p50Ms: 42,
      p95Ms: 120,
      p99Ms: 250,
    });
  });

  it("polls until the query becomes Complete", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-5" } as never)
      .mockResolvedValueOnce({ status: "Running" } as never)
      .mockResolvedValueOnce({ status: "Running" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [[{ field: "eventCount", value: "10" }]],
      } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result?.count).toBe(10);
    expect(mockCloudWatchClient.send).toHaveBeenCalledTimes(4);
  });

  it("returns null when the query does not complete within the timeout", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-6" } as never)
      .mockResolvedValue({ status: "Running" } as never);

    const promise = queryMetricsSnapshot(
      mockCloudWatchClient,
      "/aws/lambda/test",
      0,
      60,
    );

    await jest.advanceTimersByTimeAsync(60_000);
    const result = await promise;

    expect(result).toBeNull();
  });
});

describe("queryDeliveryMetricsSnapshot", () => {
  it("returns null when logGroupNames is empty", async () => {
    const result = await queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      [],
      0,
      60,
    );

    expect(result).toBeNull();
    expect(mockCloudWatchClient.send).not.toHaveBeenCalled();
  });

  it("returns null when StartQuery returns no queryId", async () => {
    mockCloudWatchClient.send.mockResolvedValueOnce({} as never);

    const result = await queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    expect(result).toBeNull();
  });

  it("sends logGroupNames to StartQuery", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-d1" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const logGroups = [
      "/aws/lambda/test-https-client-perf-client-1",
      "/aws/lambda/test-https-client-perf-client-2",
    ];

    const promise = queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      logGroups,
      0,
      60,
    );

    await jest.runAllTimersAsync();
    await promise;

    const startCmd = mockCloudWatchClient.send.mock.calls[0][0] as {
      input: { logGroupNames: string[] };
    };
    expect(startCmd.input.logGroupNames).toEqual(logGroups);
  });

  it("returns a snapshot with zeroed metrics when the result row is empty", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-d2" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const promise = queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      deliveryCount: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    });
    expect(result?.snapshotAt).toBeGreaterThan(0);
  });

  it("returns a populated snapshot when query completes successfully", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-d3" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "deliveryCount", value: "200" },
            { field: "p50", value: "85" },
            { field: "p95", value: "250" },
            { field: "p99", value: "450" },
          ],
        ],
      } as never);

    const promise = queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      deliveryCount: 200,
      p50Ms: 85,
      p95Ms: 250,
      p99Ms: 450,
    });
  });

  it("returns null when the query status is Failed", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-d4" } as never)
      .mockResolvedValueOnce({ status: "Failed" } as never);

    const promise = queryDeliveryMetricsSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });
});

describe("queryCircuitBreakerSnapshot", () => {
  it("returns null when logGroupNames is empty", async () => {
    const result = await queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      [],
      0,
      60,
    );

    expect(result).toBeNull();
    expect(mockCloudWatchClient.send).not.toHaveBeenCalled();
  });

  it("returns null when StartQuery returns no queryId", async () => {
    mockCloudWatchClient.send.mockResolvedValueOnce({} as never);

    const result = await queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    expect(result).toBeNull();
  });

  it("returns a snapshot with zeroed metrics when the result row is empty", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-cb1" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const promise = queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      100,
      160,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      intervalStartSec: 100,
      intervalEndSec: 160,
      circuitOpenEvents: 0,
      circuitCloseEvents: 0,
      admissionDeniedCircuitOpen: 0,
      admissionDeniedRateLimited: 0,
      deliveryAttempts: 0,
      deliverySuccesses: 0,
      deliveryFailures: 0,
      deliveryRateLimited: 0,
    });
    expect(result?.snapshotAt).toBeGreaterThan(0);
  });

  it("returns a populated snapshot when query completes successfully", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-cb2" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "circuitOpenEvents", value: "3" },
            { field: "circuitCloseEvents", value: "2" },
            { field: "admissionDeniedCircuitOpen", value: "15" },
            { field: "admissionDeniedRateLimited", value: "8" },
            { field: "deliveryAttempts", value: "200" },
            { field: "deliverySuccesses", value: "180" },
            { field: "deliveryFailures", value: "12" },
            { field: "deliveryRateLimited", value: "8" },
          ],
        ],
      } as never);

    const promise = queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      100,
      160,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      intervalStartSec: 100,
      intervalEndSec: 160,
      circuitOpenEvents: 3,
      circuitCloseEvents: 2,
      admissionDeniedCircuitOpen: 15,
      admissionDeniedRateLimited: 8,
      deliveryAttempts: 200,
      deliverySuccesses: 180,
      deliveryFailures: 12,
      deliveryRateLimited: 8,
    });
  });

  it("sends logGroupNames to StartQuery", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-cb3" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const logGroups = [
      "/aws/lambda/test-https-client-perf-client-1",
      "/aws/lambda/test-https-client-perf-client-2",
    ];

    const promise = queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      logGroups,
      0,
      60,
    );

    await jest.runAllTimersAsync();
    await promise;

    const startCmd = mockCloudWatchClient.send.mock.calls[0][0] as {
      input: { logGroupNames: string[] };
    };
    expect(startCmd.input.logGroupNames).toEqual(logGroups);
  });

  it("returns null when the query status is Failed", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-cb4" } as never)
      .mockResolvedValueOnce({ status: "Failed" } as never);

    const promise = queryCircuitBreakerSnapshot(
      mockCloudWatchClient,
      ["/aws/lambda/test-https-client-perf-client-1"],
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });
});

describe("queryPerClientRateTimeline", () => {
  it("returns empty array when StartQuery returns no queryId", async () => {
    mockCloudWatchClient.send.mockResolvedValueOnce({} as never);

    const result = await queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    expect(result).toEqual([]);
  });

  it("returns empty array when the query status is Failed", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr1" } as never)
      .mockResolvedValueOnce({ status: "Failed" } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
  });

  it("returns empty array when results are empty", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr2" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
  });

  it("returns empty array when results is undefined", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr2b" } as never)
      .mockResolvedValueOnce({ status: "Complete" } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
  });

  it("defaults missing fields to zero", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr2c" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [[{ field: "unknownField", value: "123" }]],
      } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveLength(1);
    expect(result[0].deliveryAttempts).toBe(0);
    expect(result[0].timestampSec).toBe(
      Math.floor(new Date("0").getTime() / 1000),
    );
  });

  it("returns entries sorted by time bin when query completes", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr3" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "timeBin", value: "2026-04-09 10:00:00.000" },
            { field: "deliveryAttempts", value: "42" },
          ],
          [
            { field: "timeBin", value: "2026-04-09 10:00:10.000" },
            { field: "deliveryAttempts", value: "38" },
          ],
        ],
      } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      timestampSec: Math.floor(
        new Date("2026-04-09 10:00:00.000").getTime() / 1000,
      ),
      deliveryAttempts: 42,
    });
    expect(result[1]).toEqual({
      timestampSec: Math.floor(
        new Date("2026-04-09 10:00:10.000").getTime() / 1000,
      ),
      deliveryAttempts: 38,
    });
  });

  it("sends logGroupName to StartQuery", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr4" } as never)
      .mockResolvedValueOnce({ status: "Complete", results: [] } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      100,
      200,
    );

    await jest.runAllTimersAsync();
    await promise;

    const startCmd = mockCloudWatchClient.send.mock.calls[0][0] as {
      input: { logGroupName: string; startTime: number; endTime: number };
    };
    expect(startCmd.input.logGroupName).toBe(
      "/aws/lambda/test-https-client-perf-client-1",
    );
    expect(startCmd.input.startTime).toBe(100);
    expect(startCmd.input.endTime).toBe(200);
  });

  it("polls until the query becomes Complete", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr5" } as never)
      .mockResolvedValueOnce({ status: "Running" } as never)
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "timeBin", value: "2026-04-09 10:00:00.000" },
            { field: "deliveryAttempts", value: "5" },
          ],
        ],
      } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveLength(1);
    expect(result[0].deliveryAttempts).toBe(5);
    expect(mockCloudWatchClient.send).toHaveBeenCalledTimes(3);
  });

  it("returns empty array when the query does not complete within the timeout", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr6" } as never)
      .mockResolvedValue({ status: "Running" } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.advanceTimersByTimeAsync(60_000);
    const result = await promise;

    expect(result).toEqual([]);
  });

  it("returns empty array when the query status is Cancelled", async () => {
    mockCloudWatchClient.send
      .mockResolvedValueOnce({ queryId: "qid-pcr7" } as never)
      .mockResolvedValueOnce({ status: "Cancelled" } as never);

    const promise = queryPerClientRateTimeline(
      mockCloudWatchClient,
      "/aws/lambda/test-https-client-perf-client-1",
      0,
      60,
    );

    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
  });
});
