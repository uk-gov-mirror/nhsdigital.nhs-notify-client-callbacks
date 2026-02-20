import pino from "pino";

export interface LogContext {
  correlationId?: string;
  clientId?: string;
  eventType?: string;
  messageId?: string;
  statusCode?: number;
  error?: Error | string;
  [key: string]: any;
}

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

  addContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
    this.pinoLogger = basePinoLogger.child(this.context);
  }

  clearContext(): void {
    this.context = {};
    this.pinoLogger = basePinoLogger;
  }

  child(context: LogContext): Logger {
    const mergedContext = { ...this.context, ...context };
    return new Logger(mergedContext);
  }

  info(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.info(additionalContext || {}, message);
  }

  warn(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.warn(additionalContext || {}, message);
  }

  error(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.error(additionalContext || {}, message);
  }

  debug(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.debug(additionalContext || {}, message);
  }
}

export const logger = new Logger();

export function extractCorrelationId(event: unknown): string | undefined {
  if (!event || typeof event !== "object" || !("id" in event)) return undefined;
  return typeof event.id === "string" ? event.id : undefined;
}

export function logLifecycleEvent(
  eventLogger: Logger,
  stage:
    | "received"
    | "transformation-started"
    | "transformation-completed"
    | "delivery-initiated"
    | "batch-processing-completed",
  context: LogContext,
): void {
  eventLogger.info(`Callback lifecycle: ${stage}`, context);
}
