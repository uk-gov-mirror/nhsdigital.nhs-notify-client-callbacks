import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

const basePinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  },
  pino.destination({ sync: true }),
);

let s3Client: S3Client | undefined;
const pendingWrites = new Set<Promise<void>>();

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

function writeToDebugBucket(
  level: string,
  message: string,
  getContext: () => LogContext,
): void {
  const bucketName = process.env.DEBUG_BUCKET_NAME;
  if (!bucketName) return;

  const context = getContext();
  if (!context.correlationId) return;

  const key = `${context.correlationId}/${Date.now()}-${crypto.randomUUID()}.json`;
  const body = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  });

  const write = getS3Client()
    .send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: "application/json",
      }),
    )
    .then(() => {})
    .catch((error: unknown) => {
      basePinoLogger.error(
        { error, key },
        "Failed to write debug log entry to S3",
      );
    })
    .finally(() => {
      pendingWrites.delete(write);
    });

  pendingWrites.add(write);
}

/**
 * Awaits all in-flight logging operations. Lambda handlers must call this before
 * returning a response, otherwise the process may be frozen before the writes
 * complete.
 */
export async function flushLogs(): Promise<void> {
  await Promise.allSettled(pendingWrites);
}

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
    writeToDebugBucket("INFO", message, () => ({
      ...this.context,
      ...additionalContext,
    }));
  }

  warn(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.warn(additionalContext ?? {}, message);
    writeToDebugBucket("WARN", message, () => ({
      ...this.context,
      ...additionalContext,
    }));
  }

  error(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.error(additionalContext ?? {}, message);
    writeToDebugBucket("ERROR", message, () => ({
      ...this.context,
      ...additionalContext,
    }));
  }

  debug(message: string, additionalContext?: LogContext): void {
    this.pinoLogger.debug(additionalContext ?? {}, message);
    writeToDebugBucket("DEBUG", message, () => ({
      ...this.context,
      ...additionalContext,
    }));
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
