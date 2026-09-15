import { z } from "zod"
import { ApiError } from "./errors"

/**
 * Lightweight typed fetch wrapper.
 *
 * - In the browser, prepends an empty base URL so the request stays
 *   same-origin and Better Auth's `SameSite=Lax` session cookie is
 *   sent. The Next.js dev rewrite (`apps/web/next.config.ts`) proxies
 *   `/api/:path*` to `apps/api`. In production the same routing is done
 *   by the reverse proxy (Caddy/Nginx) at the edge.
 * - On the server (rarely needed — prefer `serverApiFetch` from
 *   `./server`), prepends `NEXT_PUBLIC_API_URL` so the request goes
 *   straight to `apps/api` without looping through Next.
 * - Sets `credentials: "include"` — a no-op for same-origin requests
 *   but kept as a safety net in case a caller ever needs to point at
 *   the API directly (e.g. during local debugging).
 * - Serialises object bodies as JSON with `Content-Type: application/json`.
 * - Returns the parsed JSON body as `T`.
 * - Throws `ApiError` for any non-2xx response, after parsing the standard
 *   `{ error: { code, message, details? } }` shape.
 *
 * Consumers should not call `fetch` directly. Use `apiFetch` or the `api`
 * facade (`./index.ts`) instead so credentials, error parsing and base URLs
 * stay consistent.
 */
export type ApiInit = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown
  headers?: Record<string, string>
  /** Optional Zod schema to validate the response against. */
  schema?: z.ZodType<unknown>
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

function resolveBaseUrl(): string {
  // Browser: stay same-origin so the Better Auth session cookie
  // (`SameSite=Lax`) travels with the request. Dev rewrites and prod
  // reverse-proxy rules both forward `/api/*` to `apps/api`.
  if (typeof window !== "undefined") return ""
  // Server: talk to the API directly, bypassing the Next rewrite so we
  // don't pay an extra hop. Prefer the server-only `API_URL` and fall
  // back to the public one for backward compatibility.
  const value = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL
  if (!value) {
    throw new Error(
      "API_URL (or NEXT_PUBLIC_API_URL) is not set. The UI cannot reach apps/api.",
    )
  }
  return value.replace(/\/$/, "")
}

export async function apiFetchRaw(
	path: string,
	init: ApiInit = {},
): Promise<Response> {
	const url = `${resolveBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
	const headers: Record<string, string> = {
		Accept: "application/json",
		...(init.headers ?? {}),
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
			headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
		}
	}

	const res = await fetch(url, {
		...init,
		headers,
		body,
		credentials: "include",
	})

	if (!res.ok) {
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

	return res
}

export async function apiFetch<T>(
	path: string,
	init: ApiInit = {},
): Promise<T> {
  const url = `${resolveBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
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
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body,
    credentials: "include",
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