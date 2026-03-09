import pino from "pino";
import {
  LogContext,
  Logger,
  extractCorrelationId,
  logLifecycleEvent,
  logger,
} from "services/logger";

jest.mock("pino", () => {
  const info = jest.fn();
  const error = jest.fn();
  const warn = jest.fn();
  const debug = jest.fn();
  const child = jest.fn();
  const mockPino = jest.fn(() => ({ info, error, warn, debug, child }));
  Object.defineProperty(mockPino, "destination", {
    value: jest.fn(() => ({})),
  });
  return {
    __esModule: true,
    default: mockPino,
    info,
    error,
    warn,
    debug,
    child,
  };
});

const mockLoggerMethods = pino() as any;

describe("Logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        messageId: "msg-101",
      };

      testLogger.addContext(additionalContext);

      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "corr-123",
        clientId: "client-456",

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

      expect(testLogger).toBeInstanceOf(Logger);
    });
  });

  describe("child", () => {
    it("should create a child logger with new context", () => {
      const testLogger = new Logger();
      const childContext: LogContext = {
        correlationId: "corr-123",
      };

      const childLogger = testLogger.child(childContext);

      expect(childLogger).toBeInstanceOf(Logger);
      expect(mockLoggerMethods.child).toHaveBeenCalledWith(childContext);
    });

    it("should merge parent context with child context", () => {
      const parentContext: LogContext = {
        correlationId: "parent-corr",
        clientId: "client-123",
      };
      const testLogger = new Logger(parentContext);

      mockLoggerMethods.child.mockClear();

      const childContext: LogContext = {
        messageId: "msg-101",
      };

      const childLogger = testLogger.child(childContext);

      expect(childLogger).toBeInstanceOf(Logger);
      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "parent-corr",
        clientId: "client-123",

        messageId: "msg-101",
      });
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

  it("should return undefined when id is not present", () => {
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
  const context: LogContext = { correlationId: "corr-123" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    "processing-started",
    "transformation-started",
    "transformation-completed",
    "delivery-initiated",
  ] as Parameters<typeof logLifecycleEvent>[1][])(
    "should log %s lifecycle event",
    (event) => {
      const testLogger = new Logger();

      logLifecycleEvent(testLogger, event, context);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        context,
        `Callback lifecycle: ${event}`,
      );
    },
  );
});
