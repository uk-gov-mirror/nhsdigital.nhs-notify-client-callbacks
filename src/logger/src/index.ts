import pino from "pino";

export const REDACT_PATHS = [
  "messageReference",
  "channelStatusDescription",
  "messageStatusDescription",
  "error.config",
  "error.request",
  "error.response",
  "err.config",
  "err.request",
  "err.response",
];

export interface LogContext {
  correlationId?: string;
  clientId?: string;
  eventType?: string;
  messageId?: string;
  statusCode?: number;
  error?: Error | string;

  [key: string]: any;
}

const resolveLogLevel = (level = "info"): string => level;

const basePinoLogger = pino(
  {
    level: resolveLogLevel(process.env.LOG_LEVEL),
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    redact: REDACT_PATHS,
  },
  pino.destination({ sync: true }),
);

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
    return new Logger({ ...this.context, ...context });
  }

  info(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.info(additionalContext ?? {}, message);
  }

  warn(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.warn(additionalContext ?? {}, message);
  }

  error(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.error(additionalContext ?? {}, message);
  }

  debug(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.debug(additionalContext ?? {}, message);
  }
}

export const logger = new Logger();

export function extractCorrelationId(event: unknown): string | undefined {
  if (!event || typeof event !== "object" || !("id" in event)) return undefined;
  const { id } = event as Record<string, unknown>;
  return typeof id === "string" ? id : undefined;
}

export function logLifecycleEvent(
  eventLogger: Logger,
  stage:
    | "processing-started"
    | "transformation-started"
    | "transformation-completed"
    | "filtering-started"
    | "filtering-matched"
    | "delivery-initiated"
    | "batch-processing-completed",
  context: LogContext,
): void {
  eventLogger.info(`Callback lifecycle: ${stage}`, context);
}
