import type { ContentfulStatusCode } from "hono/utils/http-status"

export type ErrorBody = {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export function errorBody(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody {
  return {
    error: details ? { code, message, details } : { code, message },
  }
}

export function asStatus(code: number): ContentfulStatusCode {
  return code as ContentfulStatusCode
}