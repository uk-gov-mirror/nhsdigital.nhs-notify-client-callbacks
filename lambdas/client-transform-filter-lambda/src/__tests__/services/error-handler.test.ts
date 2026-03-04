import {
  ErrorType,
  LambdaError,
  TransformationError,
  ValidationError,
  getEventError,
  wrapUnknownError,
} from "services/error-handler";

describe("ErrorType", () => {
  it("should define all error types", () => {
    expect(ErrorType.VALIDATION_ERROR).toBe("ValidationError");
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
      true,
    );

    expect(error.message).toBe("Test error");
    expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("LambdaError");
    expect(error).toBeInstanceOf(Error);
  });

  it("should create error with optional parameters", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");

    expect(error.message).toBe("Test error");
    expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should maintain stack trace", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("LambdaError");
  });

  it("should have correct properties", () => {
    const error = new LambdaError(
      ErrorType.VALIDATION_ERROR,
      "Invalid schema",
      "corr-789",
      false,
    );

    expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.message).toBe("Invalid schema");
    expect(error.correlationId).toBe("corr-789");
    expect(error.retryable).toBe(false);
  });

  it("should have correct properties without optional fields", () => {
    const error = new LambdaError(ErrorType.UNKNOWN_ERROR, "Test error");

    expect(error.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(error.message).toBe("Test error");
    expect(error.correlationId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });
});

describe("ValidationError", () => {
  it("should create validation error", () => {
    const error = new ValidationError("Schema mismatch", "corr-123");

    expect(error.message).toBe("Schema mismatch");
    expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.retryable).toBe(false);
    expect(error.name).toBe("ValidationError");
  });

  it("should create validation error without optional parameters", () => {
    const error = new ValidationError("Schema mismatch");

    expect(error.message).toBe("Schema mismatch");
    expect(error.errorType).toBe(ErrorType.VALIDATION_ERROR);
    expect(error.correlationId).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should be instance of LambdaError and Error", () => {
    const error = new ValidationError("Test");
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(LambdaError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("TransformationError", () => {
  it("should create transformation error", () => {
    const error = new TransformationError("Missing field", "corr-123");

    expect(error.message).toBe("Missing field");
    expect(error.errorType).toBe(ErrorType.TRANSFORMATION_ERROR);
    expect(error.correlationId).toBe("corr-123");
    expect(error.retryable).toBe(false);
    expect(error.name).toBe("TransformationError");
  });

  it("should create transformation error without optional parameters", () => {
    const error = new TransformationError("Missing field");

    expect(error.message).toBe("Missing field");
    expect(error.errorType).toBe(ErrorType.TRANSFORMATION_ERROR);
    expect(error.correlationId).toBeUndefined();
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
    const originalError = new ValidationError("Original", "corr-123");
    const wrapped = wrapUnknownError(originalError, "corr-789");

    expect(wrapped).toBe(originalError);
    expect(wrapped.correlationId).toBe("corr-123");
  });

  it("should wrap standard Error", () => {
    const originalError = new Error("Standard error");
    const wrapped = wrapUnknownError(originalError, "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Standard error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(wrapped.correlationId).toBe("corr-123");
    expect(wrapped.retryable).toBe(false);
  });

  it("should wrap Error without optional parameters", () => {
    const originalError = new Error("Standard error");
    const wrapped = wrapUnknownError(originalError);

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Standard error");
    expect(wrapped.correlationId).toBeUndefined();
  });

  it("should wrap string error", () => {
    const wrapped = wrapUnknownError("String error", "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("String error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect(wrapped.correlationId).toBe("corr-123");
    expect(wrapped.retryable).toBe(false);
  });

  it("should wrap object error", () => {
    const errorObj = { code: 500, details: "Internal error" };
    const wrapped = wrapUnknownError(errorObj, "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe(JSON.stringify(errorObj));
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should handle object with circular references", () => {
    const circularObj: any = { name: "test" };
    circularObj.self = circularObj;

    const wrapped = wrapUnknownError(circularObj, "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error (unable to serialize)");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap null error", () => {
    const wrapped = wrapUnknownError(null, "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap undefined error", () => {
    const wrapped = wrapUnknownError(undefined as unknown, "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("Unknown error");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });

  it("should wrap array error", () => {
    const wrapped = wrapUnknownError([1, 2, 3], "corr-123");

    expect(wrapped).toBeInstanceOf(LambdaError);
    expect(wrapped.message).toBe("[1,2,3]");
    expect(wrapped.errorType).toBe(ErrorType.UNKNOWN_ERROR);
  });
});

describe("getEventError", () => {
  const mockMetrics = {
    emitValidationError: jest.fn(),
    emitTransformationFailure: jest.fn(),
  };

  const mockEventLogger = {
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return ValidationError and emit validation metric", () => {
    const error = new ValidationError("Invalid event", "corr-validation");

    const result = getEventError(
      error,
      mockMetrics,
      mockEventLogger,
      "message.status.transitioned",
    );

    expect(result).toBe(error);
    expect(mockEventLogger.error).toHaveBeenCalledWith(
      "Event validation failed",
      {
        correlationId: "corr-validation",
        error,
      },
    );
    expect(mockMetrics.emitValidationError).toHaveBeenCalled();
    expect(mockMetrics.emitTransformationFailure).not.toHaveBeenCalled();
  });

  it("should return TransformationError and emit transformation metric", () => {
    const error = new TransformationError(
      "Transformation failed",
      "corr-transform",
    );

    const result = getEventError(
      error,
      mockMetrics,
      mockEventLogger,
      "channel.status.transitioned",
    );

    expect(result).toBe(error);
    expect(mockEventLogger.error).toHaveBeenCalledWith(
      "Event transformation failed",
      {
        correlationId: "corr-transform",
        eventType: "channel.status.transitioned",
        error,
      },
    );
    expect(mockMetrics.emitTransformationFailure).toHaveBeenCalled();
    expect(mockMetrics.emitValidationError).not.toHaveBeenCalled();
  });

  it("should wrap unknown error and emit unknown transformation metric", () => {
    const error = new Error("Unexpected runtime error");

    const result = getEventError(
      error,
      mockMetrics,
      mockEventLogger,
      "message.status.transitioned",
    );

    expect(result).toBeInstanceOf(LambdaError);
    expect(result.message).toBe("Unexpected runtime error");
    expect((result as LambdaError).errorType).toBe(ErrorType.UNKNOWN_ERROR);
    expect((result as LambdaError).correlationId).toBe("unknown");

    expect(mockEventLogger.error).toHaveBeenCalledWith(
      "Unexpected error processing event",
      {
        correlationId: "unknown",
        error: result,
      },
    );
    expect(mockMetrics.emitTransformationFailure).toHaveBeenCalled();
    expect(mockMetrics.emitValidationError).not.toHaveBeenCalled();
  });
});
