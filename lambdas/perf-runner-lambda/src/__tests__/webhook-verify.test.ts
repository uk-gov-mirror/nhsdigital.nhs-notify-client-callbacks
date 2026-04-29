import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { verifyMockWebhook } from "webhook-verify";

const mockSend = jest.fn();
const mockClient = { send: mockSend } as unknown as CloudWatchLogsClient;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("verifyMockWebhook", () => {
  it("returns verified=true when callbacks are found", async () => {
    mockSend.mockResolvedValueOnce({ queryId: "q-1" }).mockResolvedValueOnce({
      status: "Complete",
      results: [[{ field: "callbackCount", value: "42" }]],
    });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 42, verified: true });
  });

  it("returns verified=false when no callbacks are found", async () => {
    mockSend.mockResolvedValueOnce({ queryId: "q-2" }).mockResolvedValueOnce({
      status: "Complete",
      results: [[{ field: "callbackCount", value: "0" }]],
    });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("returns verified=false when query fails", async () => {
    mockSend
      .mockResolvedValueOnce({ queryId: "q-3" })
      .mockResolvedValueOnce({ status: "Failed" });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("returns verified=false when no queryId is returned", async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("returns verified=false when results are empty", async () => {
    mockSend.mockResolvedValueOnce({ queryId: "q-4" }).mockResolvedValueOnce({
      status: "Complete",
      results: [],
    });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("returns verified=false when results field is undefined", async () => {
    mockSend.mockResolvedValueOnce({ queryId: "q-4b" }).mockResolvedValueOnce({
      status: "Complete",
      results: undefined,
    });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("polls until the query completes", async () => {
    mockSend
      .mockResolvedValueOnce({ queryId: "q-5" })
      .mockResolvedValueOnce({ status: "Running" })
      .mockResolvedValueOnce({
        status: "Complete",
        results: [[{ field: "callbackCount", value: "10" }]],
      });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 10, verified: true });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it("returns verified=false when query is cancelled", async () => {
    mockSend
      .mockResolvedValueOnce({ queryId: "q-6" })
      .mockResolvedValueOnce({ status: "Cancelled" });

    const result = await verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });
  });

  it("returns verified=false when polling times out", async () => {
    jest.useFakeTimers();

    mockSend.mockResolvedValueOnce({ queryId: "q-7" }).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: "Running" }), 1000);
        }),
    );

    const originalDateNow = Date.now;
    let callCount = 0;
    jest.spyOn(Date, "now").mockImplementation(() => {
      callCount += 1;
      if (callCount <= 1) return originalDateNow.call(Date);
      return originalDateNow.call(Date) + 60_000;
    });

    const promise = verifyMockWebhook(
      mockClient,
      "/aws/lambda/test-mock-webhook",
      1000,
      2000,
    );

    await jest.advanceTimersByTimeAsync(60_000);

    const result = await promise;

    expect(result).toEqual({ receivedCallbacks: 0, verified: false });

    jest.useRealTimers();
    jest.restoreAllMocks();
  });
});
