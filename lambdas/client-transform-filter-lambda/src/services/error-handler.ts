/* eslint-disable max-classes-per-file */

export enum ErrorType {
  VALIDATION_ERROR = "ValidationError",
  TRANSFORMATION_ERROR = "TransformationError",
  UNKNOWN_ERROR = "UnknownError",
}

export class LambdaError extends Error {
  public readonly errorType: ErrorType;

  public readonly correlationId?: string;

  public readonly retryable: boolean;

  constructor(
    errorType: ErrorType,
    message: string,
    correlationId?: string,
    retryable = false,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = errorType;
    this.correlationId = correlationId;
    this.retryable = retryable;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends LambdaError {
  constructor(message: string, correlationId?: string) {
    super(ErrorType.VALIDATION_ERROR, message, correlationId, false);
  }
}

export class TransformationError extends LambdaError {
  constructor(message: string, correlationId?: string) {
    super(ErrorType.TRANSFORMATION_ERROR, message, correlationId, false);
  }
}

export type ValidationIssue = {
  path: string;
  message: string;
};

export function formatValidationIssuePath(path: (string | number)[]): string {
  let formatted = "";

  for (const segment of path) {
    if (typeof segment === "number") {
      formatted = `${formatted}[${segment}]`;
    } else if (formatted) {
      formatted = `${formatted}.${segment}`;
    } else {
      formatted = segment;
    }
  }

  return formatted;
}

export class ConfigValidationError extends LambdaError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      ErrorType.VALIDATION_ERROR,
      "Client subscription configuration validation failed",
      undefined,
      false,
    );
  }
}

function serializeUnknownError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error (unable to serialize)";
    }
  }

  return "Unknown error";
}

export function wrapUnknownError(
  error: unknown,
  correlationId?: string,
): LambdaError {
  if (error instanceof LambdaError) {
    return error;
  }

  if (error instanceof Error) {
    const wrappedError = new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      error.message,
      correlationId,
      false,
    );
    wrappedError.cause = error;
    wrappedError.stack = error.stack;
    return wrappedError;
  }

  const errorMessage = serializeUnknownError(error);

  return new LambdaError(
    ErrorType.UNKNOWN_ERROR,
    errorMessage,
    correlationId,
    false,
  );
}

export function getEventError(
  error: unknown,
  metrics: {
    emitValidationError: () => void;
    emitTransformationFailure: () => void;
  },
  eventLogger: { error: (message: string, context: object) => void },
  eventErrorType = "unknown",
): Error {
  const correlationId =
    error instanceof ValidationError || error instanceof TransformationError
      ? error.correlationId
      : "unknown";

  if (error instanceof ConfigValidationError) {
    eventLogger.error("Client config validation failed", {
      error,
    });
    metrics.emitValidationError();
    return error;
  }

  if (error instanceof ValidationError) {
    eventLogger.error("Event validation failed", {
      correlationId,
      error,
    });
    metrics.emitValidationError();
    return error;
  }

  if (error instanceof TransformationError) {
    eventLogger.error("Event transformation failed", {
      correlationId,
      eventType: eventErrorType,
      error,
    });
    metrics.emitTransformationFailure();
    return error;
  }

  const wrappedError = wrapUnknownError(error, correlationId);
  eventLogger.error("Unexpected error processing event", {
    correlationId,
    error: wrappedError,
  });
  metrics.emitTransformationFailure();
  return wrappedError;
}
