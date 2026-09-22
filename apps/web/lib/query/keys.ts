/**
 * Centralised query key factory.
 *
 * Keeping keys in one place prevents accidental drift between read and
 * write hooks (e.g. `use-agents-query` and `use-update-agent-mutation`
 * invalidate the same key).
 */

export const agentsKeys = {
  all: ["agents"] as const,
  list: () => [...agentsKeys.all, "list"] as const,
  detail: (id: string) => [...agentsKeys.all, "detail", id] as const,
}

/**
 * Conversation query keys — used by `useEventStream` (apps/web) to
 * invalidate the right cache entries when a realtime event arrives.
 * Even when no conversation UI ships yet, the keys need to exist so
 * the SSE bridge can call them without crashing.
 */
export const conversationsKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationsKeys.all, "list"] as const,
  detail: (id: string) => [...conversationsKeys.all, "detail", id] as const,
}

/**
 * Calendar event query keys.
 *
 * Range keys are parameterised by the window the user is looking at —
 * the calendar grid mounts a different range per page (week / day /
 * month), so the cache is keyed by `(fromMs, toMs)` to dedupe
 * concurrent fetches for the same view.
 *
 * Mutations invalidate `eventsKeys.all` so any cached range that
 * overlaps the touched row refetches on its next mount or staleTime
 * tick.
 */
export const eventsKeys = {
  all: ["events"] as const,
  list: () => [...eventsKeys.all, "list"] as const,
  range: (fromMs: number, toMs: number) =>
    [...eventsKeys.all, "range", fromMs, toMs] as const,
  detail: (id: string) => [...eventsKeys.all, "detail", id] as const,
}

/** The current authenticated user/session/org context. */
export const meKey = ["me"] as const
