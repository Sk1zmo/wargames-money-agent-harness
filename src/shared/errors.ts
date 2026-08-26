/**
 * Structured error contract.
 *
 * Every failure crossing an API or module boundary is an `AppError`. Internal
 * stack traces never reach a caller. The `details` object is curated per code
 * and contains only what the caller is entitled to see.
 */

export const ERROR_CODES = [
  // agents & adapters
  "AGENT_NOT_FOUND",
  "AGENT_ALREADY_REGISTERED",
  "AGENT_IMMUTABLE",
  "ADAPTER_CONFIG_INVALID",
  "ADAPTER_UNAVAILABLE",
  "ADAPTER_UNSUPPORTED",
  "ADAPTER_HOST_BLOCKED",
  "TARGET_TIMEOUT",
  "TARGET_MALFORMED_RESPONSE",
  "TARGET_RESPONSE_TOO_LARGE",
  "TARGET_TOOL_BUDGET_EXCEEDED",
  // scenarios
  "SCENARIO_NOT_FOUND",
  "SUITE_NOT_FOUND",
  "SCENARIO_INVALID",
  // certification
  "RUN_NOT_FOUND",
  "RUN_ALREADY_FINISHED",
  "RUN_CANCELLED",
  "CERTIFICATION_FAILED",
  // judging
  "JUDGE_UNAVAILABLE",
  "JUDGE_TIMEOUT",
  "JUDGE_MALFORMED_OUTPUT",
  "JUDGE_SCHEMA_INVALID",
  // simulator
  "SIMULATOR_INVALID_TRANSITION",
  "SIMULATOR_UNKNOWN_ENTITY",
  "SIMULATOR_MODE_VIOLATION",
  // review
  "REVIEW_NOT_FOUND",
  "REVIEW_ALREADY_DECIDED",
  // platform
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  AGENT_NOT_FOUND: 404,
  AGENT_ALREADY_REGISTERED: 409,
  AGENT_IMMUTABLE: 409,
  ADAPTER_CONFIG_INVALID: 400,
  ADAPTER_UNAVAILABLE: 503,
  ADAPTER_UNSUPPORTED: 400,
  ADAPTER_HOST_BLOCKED: 403,
  TARGET_TIMEOUT: 504,
  TARGET_MALFORMED_RESPONSE: 502,
  TARGET_RESPONSE_TOO_LARGE: 413,
  TARGET_TOOL_BUDGET_EXCEEDED: 429,
  SCENARIO_NOT_FOUND: 404,
  SUITE_NOT_FOUND: 404,
  SCENARIO_INVALID: 422,
  RUN_NOT_FOUND: 404,
  RUN_ALREADY_FINISHED: 409,
  RUN_CANCELLED: 409,
  CERTIFICATION_FAILED: 500,
  JUDGE_UNAVAILABLE: 503,
  JUDGE_TIMEOUT: 504,
  JUDGE_MALFORMED_OUTPUT: 502,
  JUDGE_SCHEMA_INVALID: 502,
  SIMULATOR_INVALID_TRANSITION: 409,
  SIMULATOR_UNKNOWN_ENTITY: 404,
  SIMULATOR_MODE_VIOLATION: 500,
  REVIEW_NOT_FOUND: 404,
  REVIEW_ALREADY_DECIDED: 409,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export type ErrorDetails = Record<string, unknown>;

export interface SerializedError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    correlationId?: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;
  readonly correlationId: string | undefined;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: ErrorDetails;
      correlationId?: string;
      cause?: unknown;
      retryable?: boolean;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code] ?? 500;
  }

  toJSON(): SerializedError {
    const payload: SerializedError["error"] = { code: this.code, message: this.message };
    if (this.details) payload.details = this.details;
    if (this.correlationId) payload.correlationId = this.correlationId;
    return { error: payload };
  }

  withCorrelation(correlationId: string): AppError {
    return new AppError(this.code, this.message, {
      details: this.details,
      correlationId,
      cause: this.cause,
      retryable: this.retryable,
    });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Converts anything thrown into a safe, serialisable error. */
export function toAppError(value: unknown, correlationId?: string): AppError {
  if (isAppError(value)) {
    return correlationId && !value.correlationId ? value.withCorrelation(correlationId) : value;
  }
  return new AppError("INTERNAL_ERROR", "An unexpected internal error occurred.", {
    correlationId,
    cause: value,
  });
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code] ?? 500;
}
