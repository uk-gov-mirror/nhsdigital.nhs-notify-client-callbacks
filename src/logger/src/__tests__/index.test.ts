import pino from "pino";
import {
  LogContext,
  Logger,
  extractCorrelationId,
  logLifecycleEvent,
  logger,
} from "..";

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

const mockLoggerMethods = pino() as jest.Mocked<ReturnType<typeof pino>>;

type PinoConfig = {
  formatters: { level: (label: string) => { level: string } };
  timestamp: () => string;
};
const capturedPinoConfig = (pino as unknown as jest.Mock).mock
  .calls[0][0] as PinoConfig;

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
      const newContext: LogContext = { correlationId: "corr-789" };

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

      testLogger.addContext({ messageId: "msg-101" });

      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "corr-123",
        clientId: "client-456",
        messageId: "msg-101",
      });
    });

    it("should override existing context keys", () => {
      const testLogger = new Logger({
        correlationId: "old-corr",
        clientId: "client-123",
      });
      mockLoggerMethods.child.mockClear();

      testLogger.addContext({ correlationId: "new-corr" });

      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "new-corr",
        clientId: "client-123",
      });
    });
  });

  describe("clearContext", () => {
    it("should clear all context from logger", () => {
      const testLogger = new Logger({ correlationId: "corr-123" });
      testLogger.clearContext();
      expect(testLogger).toBeInstanceOf(Logger);
    });
  });

  describe("child", () => {
    it("should create a child logger with new context", () => {
      const testLogger = new Logger();
      const childLogger = testLogger.child({ correlationId: "corr-123" });

      expect(childLogger).toBeInstanceOf(Logger);
      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        correlationId: "corr-123",
      });
    });

    it("should merge parent context with child context", () => {
      const testLogger = new Logger({
        correlationId: "parent-corr",
        clientId: "client-123",
      });
      mockLoggerMethods.child.mockClear();

      const childLogger = testLogger.child({ messageId: "msg-101" });

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
      const context: LogContext = {
        correlationId: "corr-789",
        error: new Error("fail"),
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
      const context: LogContext = { correlationId: "corr-101" };

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
    expect(
      extractCorrelationId({ id: "test-corr-123", type: "status-update" }),
    ).toBe("test-corr-123");
  });

  it("should return undefined when id is not present", () => {
    expect(extractCorrelationId({ type: "status-update" })).toBeUndefined();
  });

  it("should return undefined for null event", () => {
    expect(extractCorrelationId(null)).toBeUndefined();
  });

  it("should return undefined for undefined event", () => {
    expect(extractCorrelationId(undefined as unknown)).toBeUndefined();
  });

  it("should return undefined for empty object", () => {
    expect(extractCorrelationId({})).toBeUndefined();
  });

  it("should return undefined when id is not a string", () => {
    expect(extractCorrelationId({ id: 42 })).toBeUndefined();
  });

  it("should return undefined when id is present but not a string", () => {
    const event = {
      id: 42,
    };

    const correlationId = extractCorrelationId(event);

    expect(correlationId).toBeUndefined();
  });
});

describe("pino configuration", () => {
  it("level formatter should uppercase the label", () => {
    expect(capturedPinoConfig.formatters.level("info")).toEqual({
      level: "INFO",
    });
    expect(capturedPinoConfig.formatters.level("error")).toEqual({
      level: "ERROR",
    });
  });

  it("timestamp should return a JSON-fragment with an ISO timestamp", () => {
    const result = capturedPinoConfig.timestamp();
    expect(result).toMatch(/^,"timestamp":"\d{4}-\d{2}-\d{2}T/);
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
