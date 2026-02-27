import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "index";
import type { CallbackMessage, CallbackPayload } from "types";

jest.mock("pino", () => {
  const info = jest.fn();
  const error = jest.fn();
  const mockPino = jest.fn(() => ({
    info,
    error,
  }));

  return {
    __esModule: true,
    default: mockPino,
    info,
    error,
  };
});

const createMockEvent = (body: string | null): APIGatewayProxyEvent => ({
  body,
  headers: {},
  multiValueHeaders: {},
  httpMethod: "POST",
  isBase64Encoded: false,
  path: "/webhook",
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: "123456789012",
    apiId: "test-api",
    protocol: "HTTP/1.1",
    httpMethod: "POST",
    path: "/webhook",
    stage: "test",
    requestId: "test-request-id",
    requestTime: "01/Jan/2026:00:00:00 +0000",
    requestTimeEpoch: 1_735_689_600_000,
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: "127.0.0.1",
      user: null,
      userAgent: "test-agent",
      userArn: null,
    },
    authorizer: null,
    domainName: "test.execute-api.eu-west-2.amazonaws.com",
    domainPrefix: "test",
    resourceId: "test-resource",
    resourcePath: "/webhook",
  },
  resource: "/webhook",
});

describe("Mock Webhook Lambda", () => {
  describe("Happy Path", () => {
    it("should accept and log MessageStatus callback", async () => {
      const callback: CallbackMessage<CallbackPayload> = {
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
      expect(body.receivedCount).toBe(1);
    });

    it("should accept and log ChannelStatus callback", async () => {
      const callback: CallbackMessage<CallbackPayload> = {
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
      expect(body.receivedCount).toBe(1);
    });

    it("should accept multiple callbacks in one request", async () => {
      const callback: CallbackMessage<CallbackPayload> = {
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

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Callback received");
      expect(body.receivedCount).toBe(2);
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
  });

  describe("Logging", () => {
    it("should log callback with structured format including messageId", async () => {
      const callback: CallbackMessage<CallbackPayload> = {
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

      const logger = jest.requireMock("pino");
      const infoCalls = logger.info.mock.calls as unknown[][];

      expect(logger).toBeDefined();

      const callbackLog = infoCalls
        .map(([payload]: unknown[]) => payload)
        .find(
          (payload: unknown) =>
            typeof payload === "object" &&
            payload !== null &&
            "msg" in payload &&
            payload.msg ===
              'CALLBACK test-msg-789 MessageStatus : {"type":"MessageStatus","attributes":{"messageId":"test-msg-789","messageStatus":"delivered"},"links":{"message":"some-message-link"},"meta":{"idempotencyKey":"some-idempotency-key"}}',
        );

      expect(callbackLog).toBeDefined();
      expect(callbackLog).toMatchObject({
        correlationId: "test-msg-789",
        messageType: "MessageStatus",
      });
    });
  });
});
