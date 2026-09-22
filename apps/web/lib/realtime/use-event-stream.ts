"use client"

/**
 * `useEventStream` — opens a single browser EventSource to the API's
 * SSE endpoint and dispatches incoming `RealtimeEvent`s into a React
 * Query cache, invalidating the queries that could have changed.
 *
 * Lifecycle:
 *   - One EventSource per browser tab, mounted by `<EventStreamBridge>`.
 *   - On any push, we invalidate `conversationsKeys.detail(id)` and
 *     `conversationsKeys.all` so React Query refetches.
 *   - `EventSource` reconnects automatically on disconnect.
 *   - The React Query client handles dedup — never two parallel
 *     fetches for the same key.
 *
 * If `EventSource` is unsupported (jsdom, older Node tests), the hook
 * is a no-op. Tests that need a fake EventSource should mock
 * `globalThis.EventSource`.
 */
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  RealtimeEventSchema,
  type RealtimeEvent,
} from "@workspace/contracts/realtime"
import { conversationsKeys, eventsKeys } from "@/lib/query/keys"

export function useEventStream(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof window === "undefined") return
    const EventSourceCtor = window.EventSource
    if (typeof EventSourceCtor !== "function") {
      // jsdom does not ship EventSource — silently skip.
      return
    }

    const source = new EventSourceCtor("/api/realtime", {
      withCredentials: true,
    })

    // Discriminated-union decode via Zod. Malformed events (a bug in
    // the publisher or a proxy inserting garbage) are dropped — but
    // the connection stays open. Realtime is best-effort.
    function handle(raw: string): void {
      let parsed: RealtimeEvent
      try {
        parsed = RealtimeEventSchema.parse(JSON.parse(raw))
      } catch {
        return
      }
      dispatch(parsed)
    }

    function dispatch(event: RealtimeEvent): void {
      switch (event.type) {
        case "message.created":
        case "activity.created":
        case "approval.created":
        case "approval.updated":
          queryClient.invalidateQueries({
            queryKey: conversationsKeys.detail(event.conversationId),
          })
          queryClient.invalidateQueries({
            queryKey: conversationsKeys.all,
          })
          return
        case "conversation.updated":
          queryClient.invalidateQueries({
            queryKey: conversationsKeys.detail(event.conversationId),
          })
          queryClient.invalidateQueries({
            queryKey: conversationsKeys.all,
          })
          return
        case "conversation.created":
          queryClient.invalidateQueries({
            queryKey: conversationsKeys.all,
          })
          return
        case "appointment.created":
        case "appointment.updated": {
          // We don't ship appointments React Query keys yet; use
          // a generic prefix so the bookings UI refetches when
          // the project adds them. For now, also nuke the
          // conversations cache if the appointment belongs to
          // one — booking events typically come with side
          // effects on the conversation.
          queryClient.invalidateQueries({ queryKey: ["appointments"] })
          if (event.conversationId) {
            queryClient.invalidateQueries({
              queryKey: conversationsKeys.detail(event.conversationId),
            })
          }
          return
        }
        case "event.created":
        case "event.updated":
        case "event.deleted":
          // Calendar events: invalidating `eventsKeys.all` cascades to
          // every cached range that could overlap the touched row.
          // The hooks in `use-calendar-events.ts` pick up the new data
          // on their next read (immediate when the panel refetches on
          // mutation, lazy otherwise — TanStack Query's staleTime
          // window keeps the cache quiet during normal navigation).
          queryClient.invalidateQueries({ queryKey: eventsKeys.all })
          return
      }
    }

    source.addEventListener("event", (e) => {
      handle((e as MessageEvent).data)
    })
    // `ping` events keep the connection alive across proxies; no-op.
    source.addEventListener("ping", () => {})

    source.onerror = () => {
      // Browser will auto-reconnect with the configured retry
      // interval. Nothing to do here — if the SSE endpoint is
      // down for too long, React Query will refetch on the next
      // user action (or window focus) and converge.
    }

    return () => {
      source.close()
    }
  }, [queryClient])
}
