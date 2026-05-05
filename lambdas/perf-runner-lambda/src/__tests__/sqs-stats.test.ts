import type { SQSClient } from "@aws-sdk/client-sqs";
import { getQueueDepths } from "sqs-stats";

describe("getQueueDepths", () => {
  const mockSend = jest.fn();
  const mockSqsClient = { send: mockSend } as unknown as SQSClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns visible and notVisible counts for each queue URL", async () => {
    mockSend
      .mockResolvedValueOnce({
        Attributes: {
          ApproximateNumberOfMessages: "42",
          ApproximateNumberOfMessagesNotVisible: "8",
        },
      })
      .mockResolvedValueOnce({
        Attributes: {
          ApproximateNumberOfMessages: "10",
          ApproximateNumberOfMessagesNotVisible: "2",
        },
      });

    const result = await getQueueDepths(mockSqsClient, [
      "https://sqs.example.invalid/queue-a",
      "https://sqs.example.invalid/queue-b",
    ]);

    expect(result.queues).toHaveLength(2);
    expect(result.queues[0]).toEqual({
      queueUrl: "https://sqs.example.invalid/queue-a",
      visible: 42,
      notVisible: 8,
    });
    expect(result.queues[1]).toEqual({
      queueUrl: "https://sqs.example.invalid/queue-b",
      visible: 10,
      notVisible: 2,
    });
    expect(result.timestampMs).toBeGreaterThan(0);
  });

  it("defaults to 0 when attributes are missing", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: undefined });

    const result = await getQueueDepths(mockSqsClient, [
      "https://sqs.example.invalid/queue-a",
    ]);

    expect(result.queues[0].visible).toBe(0);
    expect(result.queues[0].notVisible).toBe(0);
  });

  it("sends GetQueueAttributesCommand with correct attributes requested", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: {} });

    await getQueueDepths(mockSqsClient, [
      "https://sqs.example.invalid/queue-a",
    ]);

    const command = mockSend.mock.calls[0][0] as {
      input: { QueueUrl: string; AttributeNames: string[] };
    };
    expect(command.input.QueueUrl).toBe("https://sqs.example.invalid/queue-a");
    expect(command.input.AttributeNames).toContain(
      "ApproximateNumberOfMessages",
    );
    expect(command.input.AttributeNames).toContain(
      "ApproximateNumberOfMessagesNotVisible",
    );
  });
});
