import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "index";

const TEST_API_KEY = "test-api-key";

jest.mock("@nhs-notify-client-callbacks/logger", () => {
  const instance = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return {
    Logger: jest.fn().mockReturnValue(instance),

    instance,
  };
});

const mockLogger = jest.requireMock(
  "@nhs-notify-client-callbacks/logger",
).instance;

const DEFAULT_HEADERS = {
  "x-api-key": TEST_API_KEY,
};

const createMockEvent = (
  body: string | null,
  headers: Record<string, string> = DEFAULT_HEADERS,
): APIGatewayProxyEvent =>
  ({ body, headers }) as unknown as APIGatewayProxyEvent;

describe("Mock Webhook Lambda", () => {
  beforeAll(() => {
    process.env.API_KEY = TEST_API_KEY;
  });

  afterAll(() => {
    delete process.env.API_KEY;
  });

  describe("Authentication", () => {
    it("should return 401 when x-api-key header is missing", async () => {
      const callback = { data: [] };
      const event = createMockEvent(JSON.stringify(callback), {});
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Unauthorized");
    });

    it("should return 401 when x-api-key header is incorrect", async () => {
      const callback = { data: [] };
      const event = createMockEvent(JSON.stringify(callback), {
        "x-api-key": "wrong-key",
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Unauthorized");
    });
  });

  describe("Happy Path", () => {
    it("should accept and log MessageStatus callback", async () => {
      const callback = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-123",
              messageReference: "ref-456",
              messageStatus: "delivered",
              timestamp: "2026-01-01T00:00:00Z",
            },
            links: {
              message: "some-message-link",
            },
            meta: {
              idempotencyKey: "some-idempotency-key",
            },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Callback received");
    });

    it("should accept and log ChannelStatus callback", async () => {
      const callback = {
        data: [
          {
            type: "ChannelStatus",
            attributes: {
              messageId: "msg-123",
              messageReference: "ref-456",
              channel: "nhsapp",
              channelStatus: "delivered",
              supplierStatus: "delivered",
              timestamp: "2026-01-01T00:00:00Z",
            },
            links: {
              message: "some-message-link",
            },
            meta: {
              idempotencyKey: "some-idempotency-key",
            },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Callback received");
    });

    it("should reject multiple callbacks in one request", async () => {
      const callback = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-123",
              messageStatus: "pending",
            },
            links: {
              message: "some-message-link",
            },
            meta: {
              idempotencyKey: "some-idempotency-key",
            },
          },
          {
            type: "MessageStatus",
            attributes: {
              messageId: "msg-123",
              messageStatus: "delivered",
            },
            links: {
              message: "some-message-link",
            },
            meta: {
              idempotencyKey: "some-idempotency-key",
            },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Expected exactly 1 callback item, got 2");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 when body is null", async () => {
      const event = createMockEvent(null);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("No body");
    });

    it("should return 400 when body is empty string", async () => {
      const event = createMockEvent("");
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("No body");
    });

    it("should return 400 when body is invalid JSON", async () => {
      const event = createMockEvent("invalid json {");
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid JSON body");
    });

    it("should return 400 when data field is missing", async () => {
      const event = createMockEvent(JSON.stringify({ notData: [] }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid message structure");
    });

    it("should return 400 when data field is not an array", async () => {
      const event = createMockEvent(JSON.stringify({ data: "not-array" }));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid message structure");
    });

    it("should return 400 when callback payload is missing attributes", async () => {
      const event = createMockEvent(
        JSON.stringify({ data: [{ type: "MessageStatus", id: "msg-123" }] }),
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid message structure");
    });

    it("should return 400 when callback payload type is invalid", async () => {
      const event = createMockEvent(
        JSON.stringify({
          data: [{ type: "OtherStatus", id: "msg-123", attributes: {} }],
        }),
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid message structure");
    });

    it("should return 400 when callback payload item is an array", async () => {
      const event = createMockEvent(
        JSON.stringify({ data: [["invalid-payload"]] }),
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Invalid message structure");
    });

    it("should return 500 when parsing throws non-syntax error", async () => {
      const parseSpy = jest.spyOn(JSON, "parse").mockImplementationOnce(() => {
        throw new Error("forced-parse-error");
      });

      const event = createMockEvent('{"data":[]}');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Internal server error");

      parseSpy.mockRestore();
    });

    it("should return 500 when parsing throws a non-Error value", async () => {
      const parseSpy = jest.spyOn(JSON, "parse").mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "forced-string-error";
      });

      const event = createMockEvent('{"data":[]}');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Internal server error");

      parseSpy.mockRestore();
    });
  });

  describe("Forced Status Codes", () => {
    it("should return forced status code when messageId starts with force-400-", async () => {
      const callback = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "force-400-test",
              messageStatus: "delivered",
            },
            links: { message: "some-message-link" },
            meta: { idempotencyKey: "some-idempotency-key" },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Forced status 400");
    });

    it("should return forced status code when messageId starts with force-500-", async () => {
      const callback = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "force-500-test",
              messageStatus: "delivered",
            },
            links: { message: "some-message-link" },
            meta: { idempotencyKey: "some-idempotency-key" },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Forced status 500");
    });
  });

  describe("Logging", () => {
    it("should log callback with structured format including messageId", async () => {
      const callback = {
        data: [
          {
            type: "MessageStatus",
            attributes: {
              messageId: "test-msg-789",
              messageStatus: "delivered",
            },
            links: {
              message: "some-message-link",
            },
            meta: {
              idempotencyKey: "some-idempotency-key",
            },
          },
        ],
      };

      const event = createMockEvent(JSON.stringify(callback));
      await handler(event);

      const callbackCall = mockLogger.info.mock.calls.find(
        ([message]: [string]) =>
          typeof message === "string" && message.startsWith("CALLBACK"),
      );

      expect(callbackCall).toBeDefined();
      const [message, context] = callbackCall as [
        string,
        Record<string, unknown>,
      ];
      expect(message).toContain("some-idempotency-key");
      expect(message).toContain("MessageStatus");
      expect(context).toMatchObject({
        correlationId: "some-idempotency-key",
        messageId: "test-msg-789",
        messageType: "MessageStatus",
      });

      const receivedCall = mockLogger.info.mock.calls.find(
        ([msg]: [string]) => msg === "Callback received",
      );
      expect(receivedCall).toBeDefined();
      const [, receivedContext] = receivedCall as [
        string,
        Record<string, unknown>,
      ];
      expect(receivedContext).toMatchObject({
        messageId: "test-msg-789",
        callbackType: "MessageStatus",
        signature: "",
      });
    });
  });
});
