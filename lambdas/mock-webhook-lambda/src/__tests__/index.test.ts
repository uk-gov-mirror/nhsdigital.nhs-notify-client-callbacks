import { X509Certificate } from "node:crypto";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "index";

jest.mock("node:crypto", () => ({
  ...jest.requireActual("node:crypto"),
  X509Certificate: jest.fn(),
}));

const mockX509Certificate = X509Certificate as unknown as jest.Mock;

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
  rawPath?: string,
): APIGatewayProxyEvent =>
  ({ body, headers, rawPath }) as unknown as APIGatewayProxyEvent;

const createAlbEvent = (
  body: string | null,
  headers: Record<string, string> = DEFAULT_HEADERS,
  extraHeaders: Record<string, string> = {},
): APIGatewayProxyEvent =>
  ({
    body,
    path: "/target-abc",
    httpMethod: "POST",
    headers: { ...headers, ...extraHeaders },
    requestContext: {
      elb: {
        targetGroupArn:
          "arn:aws:elasticloadbalancing:eu-west-2:123456789012:targetgroup/mock/abc",
      },
    },
  }) as unknown as APIGatewayProxyEvent;

const FAKE_CERT_HEADER = encodeURIComponent(
  "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----",
);

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

      const event = createMockEvent(
        JSON.stringify(callback),
        DEFAULT_HEADERS,
        "/target-abc-123",
      );
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("Callback received");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Callback received",
        expect.objectContaining({ path: "/target-abc-123" }),
      );
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
      class NonStandardError {
        message = "forced-string-error";
      }
      const parseSpy = jest.spyOn(JSON, "parse").mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw new NonStandardError();
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
    it("should log Callback received with structured context", async () => {
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

      const event = createMockEvent(JSON.stringify(callback), {
        ...DEFAULT_HEADERS,
        "x-hmac-sha256-signature": "test-sig",
      });
      await handler(event);

      const receivedCall = mockLogger.info.mock.calls.find(
        ([msg]: [string]) => msg === "Callback received",
      );

      expect(receivedCall).toBeDefined();
      const [, context] = receivedCall as [string, Record<string, unknown>];
      expect(context).toMatchObject({
        correlationId: "some-idempotency-key",
        messageId: "test-msg-789",
        callbackType: "MessageStatus",
        signature: "test-sig",
      });
      expect(context).toHaveProperty("payload");
    });
  });
});

describe("ALB mTLS certificate logging", () => {
  beforeAll(() => {
    process.env.API_KEY = TEST_API_KEY;
  });

  afterAll(() => {
    delete process.env.API_KEY;
  });

  beforeEach(() => {
    mockX509Certificate.mockReset();
    mockX509Certificate.mockImplementation(() => ({
      validFrom: new Date(Date.now() - 86_400_000).toString(),
      validTo: new Date(Date.now() + 86_400_000).toString(),
    }));
  });

  it("logs isMtls=false and proceeds when ALB invocation has no client certificate header", async () => {
    const event = createAlbEvent(JSON.stringify({ data: [] }));
    const result = await handler(event);

    expect(result.statusCode).not.toBe(401);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Mock webhook invoked without mTLS",
      expect.objectContaining({ isMtls: false }),
    );
  });

  it("logs isMtls=false and proceeds when client certificate header cannot be parsed", async () => {
    mockX509Certificate.mockImplementationOnce(() => {
      throw new Error("Invalid certificate");
    });
    const event = createAlbEvent(
      JSON.stringify({ data: [] }),
      DEFAULT_HEADERS,
      { "x-amzn-mtls-clientcert": FAKE_CERT_HEADER },
    );
    const result = await handler(event);

    expect(result.statusCode).not.toBe(401);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Mock webhook invoked without mTLS",
      expect.objectContaining({ isMtls: false }),
    );
  });

  it("logs isMtls=false and proceeds when client certificate is expired", async () => {
    mockX509Certificate.mockImplementationOnce(() => ({
      validFrom: new Date(Date.now() - 172_800_000).toString(),
      validTo: new Date(Date.now() - 86_400_000).toString(),
    }));
    const event = createAlbEvent(
      JSON.stringify({ data: [] }),
      DEFAULT_HEADERS,
      { "x-amzn-mtls-clientcert": FAKE_CERT_HEADER },
    );
    const result = await handler(event);

    expect(result.statusCode).not.toBe(401);
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Mock webhook invoked without mTLS",
      expect.objectContaining({ isMtls: false }),
    );
  });

  it("logs isMtls=true and proceeds when certificate is valid", async () => {
    const event = createAlbEvent(
      JSON.stringify({ data: [] }),
      { "x-api-key": "wrong-key" },
      { "x-amzn-mtls-clientcert": FAKE_CERT_HEADER },
    );
    const result = await handler(event);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "mTLS client certificate verified",
      expect.objectContaining({ isMtls: true }),
    );
    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Unauthorized");
  });

  it("processes request successfully when certificate is valid and API key is correct", async () => {
    const callback = {
      data: [
        {
          type: "MessageStatus",
          attributes: {
            messageId: "msg-alb-mtls",
            messageReference: "ref-alb",
            messageStatus: "delivered",
            timestamp: "2026-01-01T00:00:00Z",
          },
          links: { message: "some-link" },
          meta: { idempotencyKey: "idem-key-alb" },
        },
      ],
    };
    const event = createAlbEvent(JSON.stringify(callback), DEFAULT_HEADERS, {
      "x-amzn-mtls-clientcert": FAKE_CERT_HEADER,
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Callback received");
  });

  it("processes non-mTLS ALB request successfully when API key is correct", async () => {
    const callback = {
      data: [
        {
          type: "MessageStatus",
          attributes: {
            messageId: "msg-alb-no-mtls",
            messageReference: "ref-alb",
            messageStatus: "delivered",
            timestamp: "2026-01-01T00:00:00Z",
          },
          links: { message: "some-link" },
          meta: { idempotencyKey: "idem-key-alb-no-mtls" },
        },
      ],
    };
    const event = createAlbEvent(JSON.stringify(callback), DEFAULT_HEADERS);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Callback received");
  });

  it("non-ALB invocations skip certificate check", async () => {
    const event = createMockEvent(JSON.stringify({ data: [] }));
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.message).not.toBe("Mutual TLS authentication required");
  });
});
