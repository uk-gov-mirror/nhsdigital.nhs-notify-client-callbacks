import { ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";

import { changeVisibility } from "services/sqs-visibility";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-sqs", () => {
  const actual = jest.requireActual("@aws-sdk/client-sqs");
  return {
    ...actual,
    SQSClient: jest.fn().mockImplementation(() => ({
      send: (...args: unknown[]) => mockSend(...args),
    })),
  };
});

process.env.QUEUE_URL = "https://sqs.eu-west-2.invalid/123456789/test-queue";

describe("changeVisibility", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("sends ChangeMessageVisibilityCommand with correct params", async () => {
    mockSend.mockResolvedValue({});

    await changeVisibility("receipt-handle-1", 30);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(ChangeMessageVisibilityCommand);
    expect(command.input).toEqual({
      QueueUrl: "https://sqs.eu-west-2.invalid/123456789/test-queue",
      ReceiptHandle: "receipt-handle-1",
      VisibilityTimeout: 30,
    });
  });

  it("floors fractional visibility timeout", async () => {
    mockSend.mockResolvedValue({});

    await changeVisibility("receipt-handle-1", 30.7);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.VisibilityTimeout).toBe(30);
  });

  it("surfaces SDK errors", async () => {
    mockSend.mockRejectedValue(new Error("SQS error"));

    await expect(changeVisibility("receipt-handle-1", 30)).rejects.toThrow(
      "SQS error",
    );
  });

  it("throws when QUEUE_URL is not set", async () => {
    let changeFn: typeof changeVisibility;
    const saved = process.env.QUEUE_URL;
    delete process.env.QUEUE_URL;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires synchronous require
      changeFn = require("services/sqs-visibility").changeVisibility;
    });

    await expect(changeFn!("receipt-handle-1", 30)).rejects.toThrow(
      "QUEUE_URL is required",
    );

    process.env.QUEUE_URL = saved;
  });
});
