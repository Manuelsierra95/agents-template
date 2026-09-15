"use client"

import { QueryClient } from "@tanstack/react-query"

/**
 * `createQueryClient` — single QueryClient factory for the app.
 *
 * Defaults are conservative for a chat surface that polls
 * occasionally and invalidates on user actions:
 *   - `staleTime: 30_000` — avoid refetch storms in normal navigation.
 *   - `gcTime: 5 * 60_000` — keep idle cache around for back-navigation.
 *   - `refetchOnWindowFocus: false` — Phase 4 has no background sync.
 *   - `mutations.retry: 0` — never silently retry a chat mutation; the
 *     server already decrements `messages_reserved` on failure and the
 *     user should be told immediately.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  })
}

export type AppQueryClient = ReturnType<typeof createQueryClient>