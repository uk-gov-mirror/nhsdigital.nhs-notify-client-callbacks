/**
 * Structured logger with correlation ID support for Lambda function.
 *
 * Uses Pino for high-performance JSON logging.
 * Ensures dynamic data is extracted as separate log fields rather than
 * embedded in description text, enabling CloudWatch Insights queries.
 */

import pino from "pino";

export interface LogContext {
  correlationId?: string;
  clientId?: string;
  eventId?: string;
  eventType?: string;
  messageId?: string;
  statusCode?: number;
  error?: Error | string;
  [key: string]: any;
}

// Create base Pino logger configured for AWS Lambda
const basePinoLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export class Logger {
  private pinoLogger: pino.Logger;

  private context: LogContext = {};

  constructor(initialContext?: LogContext) {
    if (initialContext) {
      this.context = { ...initialContext };
      this.pinoLogger = basePinoLogger.child(initialContext);
    } else {
      this.pinoLogger = basePinoLogger;
    }
  }

  /**
   * Add persistent context that will be included in all subsequent log entries
   */
  addContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
    // Create a new child logger with the updated context
    this.pinoLogger = basePinoLogger.child(this.context);
  }

  /**
   * Clear correlation ID and other transient context
   */
  clearContext(): void {
    this.context = {};
    this.pinoLogger = basePinoLogger;
  }

  /**
   * Log an informational message
   */
  info(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.info(additionalContext || {}, message);
  }

  /**
   * Log a warning message
   */
  warn(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.warn(additionalContext || {}, message);
  }

  /**
   * Log an error message
   */
  error(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.error(additionalContext || {}, message);
  }

  /**
   * Log a debug message (only in non-production environments)
   */
  debug(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.debug(additionalContext || {}, message);
  }
}

// Export singleton instance for convenience
export const logger = new Logger();

/**
 * Extract correlation ID from CloudEvents event
 */
export function extractCorrelationId(event: unknown): string | undefined {
  // CloudEvents id field serves as correlation ID
  if (
    event &&
    typeof event === "object" &&
    "id" in event &&
    typeof event.id === "string"
  ) {
    return event.id;
  }

  // Fallback to traceparent if id not present
  if (
    event &&
    typeof event === "object" &&
    "traceparent" in event &&
    typeof event.traceparent === "string"
  ) {
    return event.traceparent;
  }

  return undefined;
}

/**
 * Log lifecycle event for end-to-end tracing
 */
export function logLifecycleEvent(
  stage:
    | "received"
    | "transformation-started"
    | "transformation-completed"
    | "delivery-initiated"
    | "delivery-completed"
    | "dlq-placement"
    | "filtered-out",
  context: LogContext,
): void {
  logger.info(`Callback lifecycle: ${stage}`, context);
}
