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

/** The current authenticated user/session/org context. */
export const meKey = ["me"] as const
