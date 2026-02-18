/**
 * Error handler for Lambda function with structured error responses.
 *
 * Distinguishes between:
 * - Validation errors: Log and fail without retry
 * - Config loading errors: Retriable transient failures
 * - Transformation errors: Non-retriable business logic failures
 *
 * All errors include errorType, message, correlationId, and eventId fields.
 */

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
  eventId?: string;
  retryable: boolean;
  originalError?: Error | string;
}

/**
 * Base class for custom Lambda errors
 */
export class LambdaError extends Error {
  public readonly errorType: ErrorType;

  public readonly correlationId?: string;

  public readonly eventId?: string;

  public readonly retryable: boolean;

  constructor(
    errorType: ErrorType,
    message: string,
    correlationId?: string,
    eventId?: string,
    retryable = false,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = errorType;
    this.correlationId = correlationId;
    this.eventId = eventId;
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
      eventId: this.eventId,
      retryable: this.retryable,
      originalError: this.message,
    };
  }
}

/**
 * Validation error - event schema is invalid
 * Not retriable - event will never be valid
 */
export class ValidationError extends LambdaError {
  constructor(message: string, correlationId?: string, eventId?: string) {
    super(ErrorType.VALIDATION_ERROR, message, correlationId, eventId, false);
  }
}

/**
 * Config loading error - S3 fetch or parse failure
 * Retriable - transient AWS service failure
 */
export class ConfigLoadingError extends LambdaError {
  constructor(message: string, correlationId?: string, eventId?: string) {
    super(
      ErrorType.CONFIG_LOADING_ERROR,
      message,
      correlationId,
      eventId,
      true,
    );
  }
}

/**
 * Transformation error - unable to transform event to callback payload
 * Not retriable - transformation logic issue or missing required field
 */
export class TransformationError extends LambdaError {
  constructor(message: string, correlationId?: string, eventId?: string) {
    super(
      ErrorType.TRANSFORMATION_ERROR,
      message,
      correlationId,
      eventId,
      false,
    );
  }
}

/**
 * Converts an unknown error value to a string message
 * Handles primitives, objects, and unknown types safely
 */
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

/**
 * Wraps an unknown error in structured format
 */
export function wrapUnknownError(
  error: unknown,
  correlationId?: string,
  eventId?: string,
): LambdaError {
  if (error instanceof LambdaError) {
    return error;
  }

  if (error instanceof Error) {
    return new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      error.message,
      correlationId,
      eventId,
      false,
    );
  }

  // For non-Error objects, convert to string message
  const errorMessage = errorToString(error);

  return new LambdaError(
    ErrorType.UNKNOWN_ERROR,
    errorMessage,
    correlationId,
    eventId,
    false,
  );
}

/**
 * Determines if an error should trigger Lambda retry
 */
export function isRetriable(error: unknown): boolean {
  if (error instanceof LambdaError) {
    return error.retryable;
  }

  // Unknown errors are not retriable by default
  return false;
}

/**
 * Formats error for CloudWatch logging
 */
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

  // Handle non-Error objects
  const errorMessage = errorToString(error);

  return {
    errorType: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    retryable: false,
  };
}
