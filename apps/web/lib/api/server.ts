import "server-only"
import { headers } from "next/headers"
import { z } from "zod"
import { ApiError } from "./errors"

/**
 * Server-only API client.
 *
 * Mirrors `lib/api/client.ts` (the browser-facing fetch wrapper) but
 * works inside Server Components, Server Actions and route handlers:
 *
 *   - reads `cookie` from `next/headers()` and forwards it on every
 *     request, so Better Auth's session cookie reaches `apps/api`
 *     without needing `credentials: "include"` (which is a no-op on
 *     the server).
 *   - never imports anything browser-only.
 *
 * Use this whenever a Server Component needs authenticated data.
 * Use `apiFetch` (from `./client`) for client mutations.
 *
 * The `import "server-only"` at the top makes Next.js fail the build if
 * a Client Component ever transitively imports this module.
 *
 * ## Cache Components rule
 *
 * `next/headers()` is a request-time API and is **forbidden inside a
 * `'use cache'` scope**. Read the cookie header in the outer Server
 * Component (above the cached function) and pass it explicitly via
 * `init.cookieHeader`. The default behaviour (`(await headers())...`)
 * still works for non-cached reads.
 */

export type ServerApiInit = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown
  headers?: Record<string, string>
  /** Optional Zod schema to validate the response against. */
  schema?: z.ZodType<unknown>
  /**
   * Override the base URL. Defaults to `API_URL` (server env) with a
   * fallback to `NEXT_PUBLIC_API_URL` (CORS does not apply to
   * server-to-server requests). Tests inject a mock here.
   */
  baseUrl?: string
  /**
   * Cookie header to forward. Defaults to reading from `next/headers()`
   * (NOT allowed inside `'use cache'`). Pass this from the parent
   * Server Component when the caller is a cached function.
   */
  cookieHeader?: string
}

const errorBodySchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .partial(),
  })
  .partial()

function resolveServerBaseUrl(override?: string): string {
  // Default to a *relative* base URL so the request goes through the
  // Next.js rewrite defined in `apps/web/next.config.ts`. The rewrite
  // ships with a hardcoded `localhost:4000` fallback, which is why
  // this works even when no env vars are loaded (Next.js does NOT
  // read `.env` from the monorepo root — only from `apps/web/.env*`,
  // which we don't have).
  //
  // Operators can opt out of the rewrite by setting `API_URL` (or
  // `NEXT_PUBLIC_API_URL`) — useful in production where the web and
  // API live behind the same edge proxy.
  const value =
    override ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  return value.replace(/\/$/, "")
}

/**
 * Callers MUST pass `T` explicitly when supplying a Zod schema. The
 * schema validates the response shape at runtime; the explicit
 * generic gives the compiler the matching type. Skipping either
 * produces a wide return.
 *
 * ```ts
 * const { agent } = await serverApiFetch<{ agent: Agent }>(
 *   `/api/agents/${id}`,
 *   { schema: AgentEnvelopeSchema },
 * )
 * ```
 */
export async function serverApiFetch<T>(
  path: string,
  init: ServerApiInit = {},
): Promise<T> {
  const baseUrl = resolveServerBaseUrl(init.baseUrl)
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`

  // Prefer the explicitly-provided cookie (cache-safe) and fall back
  // to a request-time read. When called inside `'use cache'`, the
  // caller MUST provide `cookieHeader`.
  const cookieHeader =
    init.cookieHeader ?? (await headers()).get("cookie") ?? ""

  const headersOut: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  }
  if (cookieHeader) {
    headersOut.cookie = cookieHeader
  }

  let body: BodyInit | undefined
  if (init.body !== undefined) {
    if (
      typeof init.body === "string" ||
      init.body instanceof FormData ||
      init.body instanceof Blob ||
      init.body instanceof ArrayBuffer
    ) {
      body = init.body
    } else {
      body = JSON.stringify(init.body)
      headersOut["Content-Type"] =
        headersOut["Content-Type"] ?? "application/json"
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: headersOut,
    body,
    // Server-to-server: do not surface client caching semantics.
    cache: init.cache ?? "no-store",
  })

  let payload: unknown = null
  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
  } else if (res.status !== 204) {
    try {
      payload = await res.text()
    } catch {
      payload = null
    }
  }

  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(payload)
    const errBody = parsed.success ? parsed.data?.error : undefined
    const code = errBody?.code ?? `HTTP_${res.status}`
    const message =
      errBody?.message ?? `Request failed with status ${res.status}`
    throw new ApiError({
      status: res.status,
      code,
      message,
      details: errBody?.details,
    })
  }

  if (init.schema) {
    const validated = init.schema.safeParse(payload)
    if (!validated.success) {
      throw new ApiError({
        status: 500,
        code: "CLIENT_VALIDATION_ERROR",
        message: "API response did not match the expected schema",
        details: { issues: validated.error.issues },
      })
    }
    return validated.data as T
  }

  return payload as T
}