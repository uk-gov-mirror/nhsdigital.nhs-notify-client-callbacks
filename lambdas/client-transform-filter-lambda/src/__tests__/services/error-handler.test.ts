import {
  ConfigLoadingError,
  ErrorType,
  LambdaError,
  TransformationError,
  ValidationError,
  formatErrorForLogging,
  isRetriable,
  wrapUnknownError,
} from "services/error-handler";

describe("ErrorType", () => {
  it("should define all error types", () => {
    expect(ErrorType.VALIDATION_ERROR).toBe("ValidationError");
    expect(ErrorType.CONFIG_LOADING_ERROR).toBe("ConfigLoadingError");
    expect(ErrorType.TRANSFORMATION_ERROR).toBe("TransformationError");
    expect(ErrorType.UNKNOWN_ERROR).toBe("UnknownError");
  });
});

describe("LambdaError", () => {
  it("should create error with all properties", () => {
    const error = new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      "Test error",
      "corr-123",
      "event-456",
      true,
    );

    expect(error.message).toBe("Test error");
    expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.eventId).toBe("event-456");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("LambdaError");
    expect(error).toBeInstanceOf(Error);
  });

  it("should create error with optional parameters", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");

    expect(error.message).toBe("Test error");
    expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.eventId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should maintain stack trace", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("LambdaError");
  });

  it("should serialize to JSON correctly", () => {
    const error = new LambdaError(
      ErrorType.VALIDATION_ERROR,
      "Invalid schema",
      "corr-789",
      "event-101",
      false,
    );

    const json = error.toJSON();

    expect(json).toEqual({
      errorType: ErrorType.VALIDATION_ERROR,
      message: "Invalid schema",
      correlationId: "corr-789",
      eventId: "event-101",
      retryable: false,
      originalError: "Invalid schema",
    });
  });

  it("should serialize to JSON without optional fields", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");

    const json = error.toJSON();

    expect(json).toEqual({
      errorType: ErrorType.UNKNOWN_ERROR,
      message: "Test error",
      correlationId: undefined,
      eventId: undefined,
      retryable: false,
      originalError: "Test error",
    });
  });
});

describe("ValidationError", () => {
  it("should create non-retriable validation error", () => {
    const error = new ValidationError("Schema mismatch", "corr-123", "evt-456");

    expect(error.message).toBe("Schema mismatch");
    expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.eventId).toBe("evt-456");
    expect(error.retryable).toBe(false);
    expect(error.name).toBe("ValidationError");
  });

  it("should create validation error without optional parameters", () => {
    const error = new ValidationError("Schema mismatch");

    expect(error.message).toBe("Schema mismatch");
    expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.eventId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should be instance of LambdaError and Error", () => {
    const error = new ValidationError("Test");
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(LambdaError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("ConfigLoadingError", () => {
  it("should create retriable config loading error", () => {
    const error = new ConfigLoadingError(
      "S3 unavailable",
      "corr-123",
      "evt-456",
    );

    expect(error.message).toBe("S3 unavailable");
    expect(error.errorType).toBe(ErrorType.CONFIG_LOADING_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.eventId).toBe("evt-456");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("ConfigLoadingError");
  });

  it("should create config loading error without optional parameters", () => {
    const error = new ConfigLoadingError("S3 unavailable");

    expect(error.message).toBe("S3 unavailable");
    expect(error.errorType).toBe(ErrorType.CONFIG_LOADING_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.eventId).toBeUndefined();
    expect(error.retryable).toBe(true);
  });

  it("should be instance of LambdaError and Error", () => {
    const error = new ConfigLoadingError("Test");
    expect(error).toBeInstanceOf(ConfigLoadingError);
    expect(error).toBeInstanceOf(LambdaError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("TransformationError", () => {
  it("should create non-retriable transformation error", () => {
    const error = new TransformationError(
      "Missing field",
      "corr-123",
      "evt-456",
    );

    expect(error.message).toBe("Missing field");
    expect(error.errorType).toBe(ErrorType.TRANSFORMATION_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.eventId).toBe("evt-456");
    expect(error.retryable).toBe(false);
    expect(error.name).toBe("TransformationError");
  });

  it("should create transformation error without optional parameters", () => {
    const error = new TransformationError("Missing field");

    expect(error.message).toBe("Missing field");
    expect(error.errorType).toBe(ErrorType.TRANSFORMATION_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.eventId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should be instance of LambdaError and Error", () => {
    const error = new TransformationError("Test");
    expect(error).toBeInstanceOf(TransformationError);
    expect(error).toBeInstanceOf(LambdaError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("wrapUnknownError", () => {
  it("should return LambdaError as-is", () => {
    const originalError = new ValidationError(
      "Original",
      "corr-123",
      "evt-456",
    );
    const wrapped = wrapUnknownError(originalError, "corr-789", "evt-999");

    expect(wrapped).toBe(originalError);
    expect(wrapped.correlationId).toBe("corr-123");
    expect(wrapped.eventId).toBe("evt-456");
  });

  it("should wrap standard Error", () => {
    const originalError = new Error("Standard error");
    const wrapped = wrapUnknownError(originalError, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Standard error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(wrapped.correlationId).toBe("corr-123");
    expect(wrapped.eventId).toBe("evt-456");
    expect(wrapped.retryable).toBe(false);
  });

  it("should wrap Error without optional parameters", () => {
    const originalError = new Error("Standard error");
    const wrapped = wrapUnknownError(originalError);

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Standard error");
    expect(wrapped.correlationId).toBeUndefined();
    expect(wrapped.eventId).toBeUndefined();
  });

  it("should wrap string error", () => {
    const wrapped = wrapUnknownError("String error", "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("String error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(wrapped.correlationId).toBe("corr-123");
    expect(wrapped.eventId).toBe("evt-456");
    expect(wrapped.retryable).toBe(false);
  });

  it("should wrap number error", () => {
    const wrapped = wrapUnknownError(404, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("404");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap boolean error", () => {
    const wrapped = wrapUnknownError(false, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("false");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap object error", () => {
    const errorObj = { code: 500, details: "Internal error" };
    const wrapped = wrapUnknownError(errorObj, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe(JSON.stringify(errorObj));
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should handle object with circular references", () => {
    const circularObj: any = { name: "test" };
    circularObj.self = circularObj;

    const wrapped = wrapUnknownError(circularObj, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error (unable to serialize)");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap null error", () => {
    const wrapped = wrapUnknownError(null, "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap undefined error", () => {
    const wrapped = wrapUnknownError(
      undefined as unknown,
      "corr-123",
      "evt-456",
    );

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap array error", () => {
    const wrapped = wrapUnknownError([1, 2, 3], "corr-123", "evt-456");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("[1,2,3]");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });
});

describe("isRetriable", () => {
  it("should return true for retriable LambdaError", () => {
    const error = new ConfigLoadingError("S3 error");
    expect(isRetriable(error)).toBe(true);
  });

  it("should return false for non-retriable ValidationError", () => {
    const error = new ValidationError("Invalid schema");
    expect(isRetriable(error)).toBe(false);
  });

  it("should return false for non-retriable TransformationError", () => {
    const error = new TransformationError("Missing field");
    expect(isRetriable(error)).toBe(false);
  });

  it("should return false for custom non-retriable LambdaError", () => {
    const error = new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      "Test",
      undefined,
      undefined,
      false,
    );
    expect(isRetriable(error)).toBe(false);
  });

  it("should return true for custom retriable LambdaError", () => {
    const error = new LambdaError(
      ErrorType.UNKNOWN_ERROR,
      "Test",
      undefined,
      undefined,
      true,
    );
    expect(isRetriable(error)).toBe(true);
  });

  it("should return false for standard Error", () => {
    const error = new Error("Standard error");
    expect(isRetriable(error)).toBe(false);
  });

  it("should return false for string error", () => {
    expect(isRetriable("String error")).toBe(false);
  });

  it("should return false for null", () => {
    expect(isRetriable(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isRetriable(undefined as unknown)).toBe(false);
  });

  it("should return false for number", () => {
    expect(isRetriable(404)).toBe(false);
  });

  it("should return false for object", () => {
    expect(isRetriable({ error: "test" })).toBe(false);
  });
});

describe("formatErrorForLogging", () => {
  it("should format LambdaError with all fields", () => {
    const error = new ValidationError("Invalid schema", "corr-123", "evt-456");
    const formatted = formatErrorForLogging(error);

    expect(formatted.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(formatted.message).toBe("Invalid schema");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeDefined();
    expect(formatted.stack).toContain("ValidationError");
  });

  it("should format retriable ConfigLoadingError", () => {
    const error = new ConfigLoadingError("S3 unavailable");
    const formatted = formatErrorForLogging(error);

    expect(formatted.errorType).toBe(ErrorType.CONFIG_LOADING_ERROR);
    expect(formatted.message).toBe("S3 unavailable");
    expect(formatted.retryable).toBe(true);
    expect(formatted.stack).toBeDefined();
  });

  it("should format TransformationError", () => {
    const error = new TransformationError("Missing field");
    const formatted = formatErrorForLogging(error);

    expect(formatted.errorType).toBe(ErrorType.TRANSFORMATION_ERROR);
    expect(formatted.message).toBe("Missing field");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeDefined();
  });

  it("should format standard Error", () => {
    const error = new Error("Standard error");
    const formatted = formatErrorForLogging(error);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("Standard error");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeDefined();
    expect(formatted.stack).toContain("Error");
  });

  it("should format standard Error without stack", () => {
    const error = new Error("Test error");
    delete error.stack;
    const formatted = formatErrorForLogging(error);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("Test error");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format string error", () => {
    const formatted = formatErrorForLogging("String error");

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("String error");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format number error", () => {
    const formatted = formatErrorForLogging(404);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("404");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format boolean error", () => {
    const formatted = formatErrorForLogging(false);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("false");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format object error", () => {
    const errorObj = { code: 500, details: "Server error" };
    const formatted = formatErrorForLogging(errorObj);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe(JSON.stringify(errorObj));
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format null error", () => {
    const formatted = formatErrorForLogging(null);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("Unknown error");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format undefined error", () => {
    const formatted = formatErrorForLogging(undefined as unknown);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("Unknown error");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });

  it("should format object with circular reference", () => {
    const circularObj: any = { name: "test" };
    circularObj.self = circularObj;

    const formatted = formatErrorForLogging(circularObj);

    expect(formatted.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(formatted.message).toBe("Unknown error (unable to serialize)");
    expect(formatted.retryable).toBe(false);
    expect(formatted.stack).toBeUndefined();
  });
});
