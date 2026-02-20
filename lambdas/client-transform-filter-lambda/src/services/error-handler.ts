/* eslint-disable max-classes-per-file */

export enum ErrorType {
  VALIDATION_ERROR = "ValidationError",
  CONFIG_LOADING_ERROR = "ConfigLoadingError",
  TRANSFORMATION_ERROR = "TransformationError",
  UNKNOWN_ERROR = "UnknownError",
}

export interface StructuredError {
  errorType: ErrorType;
  message: string;
  correlationId?: string;
  retryable: boolean;
  originalError?: Error | string;
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

  toJSON(): StructuredError {
    return {
      errorType: this.errorType,
      message: this.message,
      correlationId: this.correlationId,
      retryable: this.retryable,
      originalError: this.message,
    };
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

function errorToString(error: unknown): string {
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
    return new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      error.message,
      correlationId,
      false,
    );
  }

  const errorMessage = errorToString(error);

  return new LambdaError(
    ErrorType.UNKNOWN_ERROR,
    errorMessage,
    correlationId,
    false,
  );
}

export function isRetriable(error: unknown): boolean {
  if (error instanceof LambdaError) {
    return error.retryable;
  }

  return false;
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

  const errorMessage = errorToString(error);

  return {
    errorType: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    retryable: false,
  };
}
