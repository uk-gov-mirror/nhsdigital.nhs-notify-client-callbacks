import { SendMessageCommand } from "@aws-sdk/client-sqs";

import { sendToDlq } from "services/dlq-sender";

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

process.env.DLQ_URL = "https://sqs.eu-west-2.invalid/123456789/test-dlq";

describe("sendToDlq", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("sends SendMessageCommand with correct QueueUrl and MessageBody", async () => {
    mockSend.mockResolvedValue({});

    await sendToDlq('{"test":"message"}');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input).toEqual({
      QueueUrl: "https://sqs.eu-west-2.invalid/123456789/test-dlq",
      MessageBody: '{"test":"message"}',
    });
  });

  it("surfaces SDK errors", async () => {
    mockSend.mockRejectedValue(new Error("SQS send failed"));

    await expect(sendToDlq("body")).rejects.toThrow("SQS send failed");
  });

  it("throws when DLQ_URL is not set", async () => {
    let sendFn: typeof sendToDlq;
    const saved = process.env.DLQ_URL;
    delete process.env.DLQ_URL;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.isolateModules requires synchronous require
      sendFn = require("services/dlq-sender").sendToDlq;
    });

    await expect(sendFn!("body")).rejects.toThrow("DLQ_URL is required");

    process.env.DLQ_URL = saved;
  });
});
