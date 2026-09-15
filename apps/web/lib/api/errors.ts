/**
 * API error — thrown by `apiFetch` for any non-2xx response.
 *
 * The shape matches the project-wide error contract:
 *
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * The `code` is a stable machine identifier (e.g. "UNAUTHORIZED",
 * "FORBIDDEN", "VALIDATION_ERROR", "RESOURCE_NOT_FOUND",
 * "INTERNAL_ERROR", "CONFLICT", "BOOKING_RULE_VIOLATED",
 * "SLOT_UNAVAILABLE").
 */
export class ApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details: unknown

  constructor({
    status,
    code,
    message,
    details,
  }: {
    status: number
    code: string
    message: string
    details?: unknown
  }) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === 403
}

export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404
}

export function isValidationError(error: unknown): boolean {
  return isApiError(error) && error.status === 400
}

export function isConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409
}
