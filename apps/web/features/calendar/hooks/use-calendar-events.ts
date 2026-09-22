"use client"

/**
 * Calendar event hooks — TanStack Query bindings.
 *
 * Reads use `useQuery` against `eventsKeys.range(fromMs, toMs)` so
 * concurrent fetches for the same visible window dedupe. Writes go
 * through the Server Actions in `../actions/calendar-events.ts` (per
 * the AGENTS.md Server-First rule) and invalidate `eventsKeys.all` on
 * success so any cached range that could overlap the touched row
 * refetches on its next staleTime tick.
 *
 * Drag-to-move is intentionally **not** a `useMutation` here. The
 * dashboard coalesces many drags into a single batch via
 * `usePendingMoves` (see `../hooks/use-pending-moves.ts`), which
 * flushes through `batchMoveEventsAction` — one HTTP round-trip and
 * one Postgres transaction per burst, regardless of how many events
 * the operator moved.
 *
 * Realtime: `use-event-stream` already invalidates `eventsKeys.all`
 * on every `event.created/updated/deleted` SSE message, so this hook
 * doesn't need to subscribe to the bus itself.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import { eventsKeys } from "@/lib/query/keys"
import type {
  CalendarEventWire,
  ListEventsQuery,
} from "@workspace/contracts/calendar"

import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
} from "../actions/calendar-events"

export type EventsRange = ListEventsQuery

/**
 * Range-overlap query. Returns the events whose `[startMs, endMs]`
 * intersects `[fromMs, toMs]`. The grid mounts a new query for each
 * visible window — `week` view uses a 7-day span, `day` uses 24h,
 * `month` uses ~6 weeks (one month plus the side strips).
 *
 * `enabled` is on by default; callers can flip it off when the bounds
 * aren't known yet (e.g. the calendar hasn't picked an anchor date).
 */
export function useListEventsInRange(
  input: EventsRange,
): UseQueryResult<CalendarEventWire[]> {
  return useQuery<CalendarEventWire[]>({
    queryKey: eventsKeys.range(input.fromMs, input.toMs),
    queryFn: async () => {
      const params = new URLSearchParams({
        fromMs: String(input.fromMs),
        toMs: String(input.toMs),
      })
      const res = await fetch(`/api/calendar/events?${params.toString()}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const code = (body as { error?: { code?: string } } | null)?.error?.code
        throw new Error(`Failed to load events (${res.status}${code ? `: ${code}` : ""})`)
      }
      const json = (await res.json()) as { events: CalendarEventWire[] }
      return json.events
    },
    staleTime: 30_000,
  })
}

export function useCreateEvent(): UseMutationResult<
  { id: string },
  Error,
  Parameters<typeof createEventAction>[0]
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => createEventAction(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventsKeys.all })
    },
  })
}

export function useUpdateEvent(): UseMutationResult<
  void,
  Error,
  { id: string; patch: Parameters<typeof updateEventAction>[1] }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateEventAction(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventsKeys.all })
    },
  })
}

export function useDeleteEvent(): UseMutationResult<
  void,
  Error,
  { id: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => deleteEventAction(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventsKeys.all })
    },
  })
}
