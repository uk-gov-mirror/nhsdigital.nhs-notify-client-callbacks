import { handler } from "index";
import { processRecords } from "handler";

jest.mock("handler", () => ({
  processRecords: jest.fn().mockResolvedValue([]),
}));

describe("handler", () => {
  it("returns batchItemFailures from processRecords", async () => {
    const event = {
      Records: [
        {
          messageId: "msg-1",
          receiptHandle: "r-1",
          body: "{}",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "0",
            SenderId: "sender",
            ApproximateFirstReceiveTimestamp: "0",
          },
          messageAttributes: {},
          md5OfBody: "abc",
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:eu-west-2:123:queue",
          awsRegion: "eu-west-2",
        },
      ],
    };

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(processRecords).toHaveBeenCalledWith(event.Records);
  });
});
