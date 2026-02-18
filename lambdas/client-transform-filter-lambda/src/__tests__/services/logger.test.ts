import pino from "pino";
import {
  LogContext,
  Logger,
  extractCorrelationId,
  logLifecycleEvent,
  logger,
} from "services/logger";

// Mock pino
jest.mock("pino", () => {
  const mockLoggerMethods = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  return jest.fn(() => mockLoggerMethods);
});

// Get reference to pino mock (cast to any to avoid TypeScript seeing real pino types)
const mockLoggerMethods = pino() as any;

describe("Logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset child mock to return the same mock logger
    mockLoggerMethods.child.mockReturnValue(mockLoggerMethods);
  });

  describe("constructor", () => {
    it("should create logger without initial context", () => {
      const testLogger = new Logger();
      expect(testLogger).toBeInstanceOf(Logger);
    });

    it("should create logger with initial context", () => {
      const initialContext: LogContext = {
        correlationId: "test-corr-123",
        clientId: "client-456",
      };

      const testLogger = new Logger(initialContext);

      expect(testLogger).toBeInstanceOf(Logger);
      expect(mockLoggerMethods.child).toHaveBeenCalledWith(initialContext);
    });
  });

  describe("addContext", () => {
    it("should add new context to logger", () => {
      const testLogger = new Logger();
      const newContext: LogContext = {
        correlationId: "corr-789",
        eventId: "evt-101",
      };

      testLogger.addContext(newContext);

      expect(mockLoggerMethods.child).toHaveBeenCalledWith(newContext);
    });

    it("should merge new context with existing context", () => {
      const initialContext: LogContext = {
        correlationId: "corr-123",
        clientId: "client-456",
      };
      const testLogger = new Logger(initialContext);

      mockLoggerMethods.child.mockClear();

      const additionalContext: LogContext = {
        eventId: "evt-789",
        messageId: "msg-101",
      };

      testLogger.addContext(additionalContext);

      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "corr-123",
        clientId: "client-456",
        eventId: "evt-789",
        messageId: "msg-101",
      });
    });

    it("should override existing context keys", () => {
      const initialContext: LogContext = {
        correlationId: "old-corr",
        clientId: "client-123",
      };
      const testLogger = new Logger(initialContext);

      mockLoggerMethods.child.mockClear();

      const newContext: LogContext = {
        correlationId: "new-corr",
      };

      testLogger.addContext(newContext);

      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "new-corr",
        clientId: "client-123",
      });
    });
  });

  describe("clearContext", () => {
    it("should clear all context from logger", () => {
      const initialContext: LogContext = {
        correlationId: "corr-123",
        clientId: "client-456",
      };
      const testLogger = new Logger(initialContext);

      testLogger.clearContext();

      // After clearing, the logger should be reset (no child logger with context)
      expect(testLogger).toBeInstanceOf(Logger);
    });
  });

  describe("info", () => {
    it("should log info message without additional context", () => {
      const testLogger = new Logger();
      testLogger.info("Test info message");

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        {},
        "Test info message",
      );
    });

    it("should log info message with additional context", () => {
      const testLogger = new Logger();
      const context: LogContext = {
        correlationId: "corr-123",
        eventType: "status-update",
      };

      testLogger.info("Test info message", context);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        context,
        "Test info message",
      );
    });
  });

  describe("warn", () => {
    it("should log warning message without additional context", () => {
      const testLogger = new Logger();
      testLogger.warn("Test warning");

      expect(mockLoggerMethods.warn).toHaveBeenCalledWith({}, "Test warning");
    });

    it("should log warning message with additional context", () => {
      const testLogger = new Logger();
      const context: LogContext = {
        correlationId: "corr-456",
        statusCode: 429,
      };

      testLogger.warn("Rate limit warning", context);

      expect(mockLoggerMethods.warn).toHaveBeenCalledWith(
        context,
        "Rate limit warning",
      );
    });
  });

  describe("error", () => {
    it("should log error message without additional context", () => {
      const testLogger = new Logger();
      testLogger.error("Test error");

      expect(mockLoggerMethods.error).toHaveBeenCalledWith({}, "Test error");
    });

    it("should log error message with additional context", () => {
      const testLogger = new Logger();
      const error = new Error("Something failed");
      const context: LogContext = {
        correlationId: "corr-789",
        error,
      };

      testLogger.error("Operation failed", context);

      expect(mockLoggerMethods.error).toHaveBeenCalledWith(
        context,
        "Operation failed",
      );
    });
  });

  describe("debug", () => {
    it("should log debug message without additional context", () => {
      const testLogger = new Logger();
      testLogger.debug("Test debug");

      expect(mockLoggerMethods.debug).toHaveBeenCalledWith({}, "Test debug");
    });

    it("should log debug message with additional context", () => {
      const testLogger = new Logger();
      const context: LogContext = {
        correlationId: "corr-101",
        eventId: "evt-202",
      };

      testLogger.debug("Debug info", context);

      expect(mockLoggerMethods.debug).toHaveBeenCalledWith(
        context,
        "Debug info",
      );
    });
  });

  describe("singleton logger instance", () => {
    it("should export a singleton logger instance", () => {
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});

describe("extractCorrelationId", () => {
  it("should extract correlation ID from event.id", () => {
    const event = {
      id: "test-corr-123",
      type: "status-update",
    };

    const correlationId = extractCorrelationId(event);

    expect(correlationId).toBe("test-corr-123");
  });

  it("should extract correlation ID from traceparent when id is not present", () => {
    const event = {
      traceparent: "00-trace-123-span-456-01",
      type: "status-update",
    };

    const correlationId = extractCorrelationId(event);

    expect(correlationId).toBe("00-trace-123-span-456-01");
  });

  it("should prefer event.id over traceparent", () => {
    const event = {
      id: "event-id-123",
      traceparent: "00-trace-123-span-456-01",
      type: "status-update",
    };

    const correlationId = extractCorrelationId(event);

    expect(correlationId).toBe("event-id-123");
  });

  it("should return undefined when neither id nor traceparent is present", () => {
    const event = {
      type: "status-update",
    };

    const correlationId = extractCorrelationId(event);

    expect(correlationId).toBeUndefined();
  });

  it("should return undefined for null event", () => {
    const correlationId = extractCorrelationId(null);

    expect(correlationId).toBeUndefined();
  });

  it("should return undefined for undefined event", () => {
    const correlationId = extractCorrelationId(undefined as unknown);

    expect(correlationId).toBeUndefined();
  });

  it("should return undefined for empty object", () => {
    const correlationId = extractCorrelationId({});

    expect(correlationId).toBeUndefined();
  });
});

describe("logLifecycleEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should log received lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      eventId: "evt-456",
    };

    logLifecycleEvent("received", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: received",
    );
  });

  it("should log transformation-started lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      eventType: "message-status-update",
    };

    logLifecycleEvent("transformation-started", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: transformation-started",
    );
  });

  it("should log transformation-completed lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      messageId: "msg-789",
    };

    logLifecycleEvent("transformation-completed", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: transformation-completed",
    );
  });

  it("should log delivery-initiated lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      clientId: "client-456",
    };

    logLifecycleEvent("delivery-initiated", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: delivery-initiated",
    );
  });

  it("should log delivery-completed lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      statusCode: 200,
    };

    logLifecycleEvent("delivery-completed", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: delivery-completed",
    );
  });

  it("should log dlq-placement lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      error: "Maximum retries exceeded",
    };

    logLifecycleEvent("dlq-placement", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: dlq-placement",
    );
  });

  it("should log filtered-out lifecycle event", () => {
    const context: LogContext = {
      correlationId: "corr-123",
      eventType: "irrelevant-update",
    };

    logLifecycleEvent("filtered-out", context);

    expect(mockLoggerMethods.info).toHaveBeenCalledWith(
      context,
      "Callback lifecycle: filtered-out",
    );
  });
});
