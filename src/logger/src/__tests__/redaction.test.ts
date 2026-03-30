import pino from "pino";
import { REDACT_PATHS } from "..";

function createTestLogger(): {
  logger: pino.Logger;
  getOutput: () => string[];
} {
  const lines: string[] = [];
  const stream: pino.DestinationStream = {
    write(msg: string) {
      lines.push(msg);
    },
  };
  const logger = pino(
    {
      level: "debug",
      redact: REDACT_PATHS,
    },
    stream,
  );
  return { logger, getOutput: () => lines };
}

function parseLastLine(lines: string[]): Record<string, unknown> {
  return JSON.parse(lines.at(-1)!) as Record<string, unknown>;
}

describe("pino redaction behaviour", () => {
  it("should redact messageReference from log output", () => {
    const { getOutput, logger } = createTestLogger();

    logger.info(
      { messageReference: "patient-nhs-1234567890", messageId: "msg-001" },
      "Callback generated",
    );

    const entry = parseLastLine(getOutput());
    expect(entry.messageReference).toBe("[Redacted]");
    expect(entry.messageId).toBe("msg-001");
  });

  it("should redact channelStatusDescription from log output", () => {
    const { getOutput, logger } = createTestLogger();

    logger.info(
      {
        channelStatusDescription: "Failed to deliver to patient address",
        channelStatus: "failed",
      },
      "Channel status",
    );

    const entry = parseLastLine(getOutput());
    expect(entry.channelStatusDescription).toBe("[Redacted]");
    expect(entry.channelStatus).toBe("failed");
  });

  it("should redact messageStatusDescription from log output", () => {
    const { getOutput, logger } = createTestLogger();

    logger.info(
      {
        messageStatusDescription: "Delivery failed for recipient",
        messageStatus: "failed",
      },
      "Message status",
    );

    const entry = parseLastLine(getOutput());
    expect(entry.messageStatusDescription).toBe("[Redacted]");
    expect(entry.messageStatus).toBe("failed");
  });

  it("should redact nested error HTTP internals from log output", () => {
    const { getOutput, logger } = createTestLogger();

    logger.error(
      {
        error: {
          message: "Request failed",
          config: { headers: { Authorization: "Bearer secret-token" } },
          request: { url: "https://example.com/api" },
          response: { status: 500, data: "Internal Server Error" },
        },
      },
      "HTTP error",
    );

    const entry = parseLastLine(getOutput());
    const errorObj = entry.error as Record<string, unknown>;
    expect(errorObj.config).toBe("[Redacted]");
    expect(errorObj.request).toBe("[Redacted]");
    expect(errorObj.response).toBe("[Redacted]");
    expect(errorObj.message).toBe("Request failed");
  });

  it("should redact nested err HTTP internals from log output", () => {
    const { getOutput, logger } = createTestLogger();

    logger.error(
      {
        err: {
          message: "Connection refused",
          config: { baseURL: "https://api.example.com" },
          request: { method: "POST" },
          response: { data: "sensitive-response-body" },
        },
      },
      "Connection error",
    );

    const entry = parseLastLine(getOutput());
    const errObj = entry.err as Record<string, unknown>;
    expect(errObj.config).toBe("[Redacted]");
    expect(errObj.request).toBe("[Redacted]");
    expect(errObj.response).toBe("[Redacted]");
    expect(errObj.message).toBe("Connection refused");
  });

  it("should not redact fields outside the redact list", () => {
    const { getOutput, logger } = createTestLogger();

    logger.info(
      {
        correlationId: "corr-safe",
        clientId: "client-123",
        eventType: "status-update",
        messageId: "msg-456",
      },
      "Normal log entry",
    );

    const entry = parseLastLine(getOutput());
    expect(entry.correlationId).toBe("corr-safe");
    expect(entry.clientId).toBe("client-123");
    expect(entry.eventType).toBe("status-update");
    expect(entry.messageId).toBe("msg-456");
  });

  it("should handle absent redacted fields without error", () => {
    const { getOutput, logger } = createTestLogger();

    logger.info({ clientId: "client-789" }, "No sensitive fields");

    const entry = parseLastLine(getOutput());
    expect(entry.clientId).toBe("client-789");
    expect(entry.messageReference).toBeUndefined();
  });
});
