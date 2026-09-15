export type ErrorCode =
  | "VALIDATION_ERROR"
  | "RESOURCE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "FORBIDDEN"
  | "CONFLICT"
  | "BOOKING_RULE_VIOLATED"
  | "SLOT_UNAVAILABLE"

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly status: number
  public readonly details: Record<string, unknown> | undefined

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.status = status
    this.details = details
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: Record<string, unknown>) {
    super("RESOURCE_NOT_FOUND", 404, message, details)
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Invalid request",
    details?: Record<string, unknown>,
  ) {
    super("VALIDATION_ERROR", 400, message, details)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super("FORBIDDEN", 403, message, details)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super("CONFLICT", 409, message, details)
  }
}

export class BookingRuleViolatedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BOOKING_RULE_VIOLATED", 422, message, details)
  }
}

export class SlotUnavailableError extends AppError {
  constructor(message = "Requested time slot is not available", details?: Record<string, unknown>) {
    super("SLOT_UNAVAILABLE", 409, message, details)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
