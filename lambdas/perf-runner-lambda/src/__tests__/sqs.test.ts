import type { SQSClient } from "@aws-sdk/client-sqs";
import type { EventMixEntry, Phase } from "types";
import { generatePhaseLoad, selectWeighted, sendSqsBatch } from "sqs";

jest.mock("event-factories", () => ({
  createEvent: jest.fn(() => ({
    specversion: "1.0",
    id: "mock-event-id",
    type: "mock.type",
    data: {},
  })),
}));

const mockSqsClient = {
  send: jest.fn(),
} as unknown as jest.Mocked<SQSClient>;

beforeEach(() => {
  mockSqsClient.send.mockResolvedValue({} as never);
});

describe("selectWeighted", () => {
  it("returns the only entry when there is one", () => {
    const entries = [{ weight: 1, value: "a" }];
    const result = selectWeighted(entries);
    expect(result).toBe(entries[0]);
  });

  it("distributes selections according to weight over many draws", () => {
    const entries = [
      { weight: 9, label: "heavy" },
      { weight: 1, label: "light" },
    ];

    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 1000; i += 1) {
      const selected = selectWeighted(entries);
      counts[selected.label as keyof typeof counts] += 1;
    }

    expect(counts.heavy).toBeGreaterThan(counts.light);
  });

  it("returns the last entry via fallback when no earlier entry matches", () => {
    // With Math.random = 0.5, remaining = 0.5 * 10 = 5.
    // First entry has weight 1; 5 - 1 = 4 > 0, so loop skips it.
    // Fallback returns the last entry.
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    const entries = [
      { weight: 1, label: "light" },
      { weight: 9, label: "heavy" },
    ];

    const result = selectWeighted(entries);
    expect(result.label).toBe("heavy");
    jest.restoreAllMocks();
  });
});

describe("sendSqsBatch", () => {
  it("sends a SendMessageBatchCommand with serialised event bodies", async () => {
    const events = [
      { specversion: "1.0", id: "a", type: "t", data: {} },
      { specversion: "1.0", id: "b", type: "t", data: {} },
    ] as never[];

    await sendSqsBatch(
      mockSqsClient,
      "https://sqs.example.invalid/queue",
      events,
    );

    expect(mockSqsClient.send).toHaveBeenCalledTimes(1);
    const command = mockSqsClient.send.mock.calls[0][0] as {
      input: {
        QueueUrl: string;
        Entries: { Id: string; MessageBody: string }[];
      };
    };
    expect(command.input.QueueUrl).toBe("https://sqs.example.invalid/queue");
    expect(command.input.Entries).toHaveLength(2);
    expect(command.input.Entries[0].Id).toBe("0");
    expect(JSON.parse(command.input.Entries[0].MessageBody)).toMatchObject({
      id: "a",
    });
  });
});

describe("generatePhaseLoad", () => {
  it("returns a PhaseResult with sent count and timing", async () => {
    const phase: Phase = { durationSecs: 1, targetEps: 10 };
    const eventMix: EventMixEntry[] = [
      {
        weight: 1,
        factory: "messageStatus",
        clientId: "perf-client-1",
        messageStatus: "DELIVERED",
      },
    ];

    const result = await generatePhaseLoad(
      mockSqsClient,
      "https://sqs.example.invalid/queue",
      phase,
      eventMix,
    );

    expect(result.targetEps).toBe(10);
    expect(result.sent).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.achievedEps).toBeGreaterThan(0);
    expect(mockSqsClient.send).toHaveBeenCalled();
  });

  it("throttles between seconds when the wave completes early", async () => {
    jest.useFakeTimers();

    const phase: Phase = { durationSecs: 2, targetEps: 10 };
    const eventMix: EventMixEntry[] = [
      {
        weight: 1,
        factory: "messageStatus",
        clientId: "perf-client-1",
        messageStatus: "DELIVERED",
      },
    ];

    const resultPromise = generatePhaseLoad(
      mockSqsClient,
      "https://sqs.example.invalid/queue",
      phase,
      eventMix,
    );

    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.sent).toBeGreaterThan(0);
    jest.useRealTimers();
  });
});
