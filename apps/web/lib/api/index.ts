import { z } from "zod"
import { apiFetch, apiFetchRaw } from "./client"
import { type AppMe } from "./types"

/**
 * API facade.
 *
 * Each namespace maps 1:1 to an apps/api route group. Consumers must
 * import from here and never call `fetch` directly. This keeps base URLs,
 * credentials, JSON handling and error parsing in a single place.
 *
 * Types are derived from `@workspace/contracts/*`. The UI never imports
 * the `AppType` from `apps/api` — that keeps the dependency direction
 * `apps/web → @workspace/contracts` and never `apps/web → apps/api`.
 *
 * Read endpoints validate responses through the Zod schemas exported
 * from `@workspace/contracts`. Contract drift fails loudly with a
 * `CLIENT_VALIDATION_ERROR` instead of producing silently-wrong
 * `undefined` values at render.
 */

function buildQuery(
  filters: Record<string, string | number | undefined | null>
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export const api = {
  me: {
    get: () => apiFetch<AppMe>("/api/me"),
  },
} as const

export type Api = typeof api
