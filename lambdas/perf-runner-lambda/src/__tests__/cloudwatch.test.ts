import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { queryDeliveryMetricsSnapshot, queryMetricsSnapshot } from "cloudwatch";

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
      "/aws/lambda/nhs-dev-callbacks-client-transform-filter",
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
