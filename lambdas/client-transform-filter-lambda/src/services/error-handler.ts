/* eslint-disable max-classes-per-file */

export enum ErrorType {
  VALIDATION_ERROR = "ValidationError",
  CONFIG_LOADING_ERROR = "ConfigLoadingError",
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

export class ConfigLoadingError extends LambdaError {
  constructor(message: string, correlationId?: string) {
    super(ErrorType.CONFIG_LOADING_ERROR, message, correlationId, true);
  }
}

export class TransformationError extends LambdaError {
  constructor(message: string, correlationId?: string) {
    super(ErrorType.TRANSFORMATION_ERROR, message, correlationId, false);
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

  if (typeof error === "number" || typeof error === "boolean") {
    return `${error}`;
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

export function isRetriable(error: unknown): boolean {
  return error instanceof LambdaError && error.retryable;
}

export function formatErrorForLogging(error: unknown): {
  errorType: string;
  message: string;
  retryable: boolean;
  stack?: string;
} {
  if (error instanceof LambdaError) {
    return {
      errorType: error.errorType,
      message: error.message,
      retryable: error.retryable,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      errorType: ErrorType.UNKNOWN_ERROR,
      message: error.message,
      retryable: false,
      stack: error.stack,
    };
  }

  const errorMessage = serializeUnknownError(error);

  return {
    errorType: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    retryable: false,
  };
}

export function getEventError(
  error: unknown,
  metrics: {
    emitValidationError: (type: string) => void;
    emitTransformationFailure: (type: string, reason: string) => void;
  },
  eventLogger: { error: (message: string, context: object) => void },
  eventErrorType = "unknown",
): Error {
  const correlationId =
    error instanceof ValidationError || error instanceof TransformationError
      ? error.correlationId
      : "unknown";

  if (error instanceof ValidationError) {
    eventLogger.error("Event validation failed", {
      correlationId,
      error,
    });
    metrics.emitValidationError(eventErrorType);
    return error;
  }

  if (error instanceof TransformationError) {
    eventLogger.error("Event transformation failed", {
      correlationId,
      eventType: eventErrorType,
      error,
    });
    metrics.emitTransformationFailure(eventErrorType, "TransformationError");
    return error;
  }

  const wrappedError = wrapUnknownError(error, correlationId);
  eventLogger.error("Unexpected error processing event", {
    correlationId,
    error: wrappedError,
  });
  metrics.emitTransformationFailure(eventErrorType, "UnknownError");
  return wrappedError;
}
