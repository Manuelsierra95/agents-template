"use server"

/**
 * Calendar event Server Actions.
 *
 * Each action is the canonical mutation entry point from Client
 * Components. They call `serverApiFetch` against `/api/calendar/events`
 * (the session-authenticated endpoint mounted by `apps/api`). Because
 * the action runs on the server, `serverApiFetch` reads the session
 * cookie from `next/headers()` and forwards it on the upstream call —
 * `apiFetch` (the browser client) doesn't, which would 401 every
 * server-to-server hop.
 *
 * Returns:
 *   - `createEvent` → `{ id }` so the create panel can drop straight
 *     into the detail view without an extra fetch.
 *   - `updateEvent`, `moveEvent`, `deleteEvent` → `void` (the SSE
 *     bridge refetches on the realtime event, so the client doesn't
 *     need a return value).
 *
 * Errors: the underlying `serverApiFetch` throws `ApiError` on non-2xx.
 * The Client Components catch it and surface a toast.
 *
 * # Cross-package Zod
 *
 * The contracts package exports schemas authored in Zod 3 while the web
 * app pulls Zod 4; the type identity is incompatible, so we skip the
 * runtime `schema` validation here. The Server Action is the trust
 * boundary for the web tier — invalid responses should never happen,
 * and the wire types are enforced at the API boundary instead.
 */
import { revalidateTag } from "next/cache"

import { serverApiFetch } from "@/lib/api/server"
import type {
  BatchMoveEntry,
  CreateEventInput,
  UpdateEventInput,
} from "@workspace/contracts/calendar"

const EVENTS_TAG = "calendar-events"

export async function createEventAction(
  input: CreateEventInput,
): Promise<{ id: string }> {
  const res = await serverApiFetch<{ event: { id: string } }>(
    "/api/calendar/events",
    {
      method: "POST",
      body: input,
    },
  )
  revalidateTag(EVENTS_TAG, "max")
  return { id: res.event.id }
}

export async function updateEventAction(
  id: string,
  patch: UpdateEventInput,
): Promise<void> {
  await serverApiFetch(`/api/calendar/events/${id}`, {
    method: "PATCH",
    body: patch,
  })
  revalidateTag(EVENTS_TAG, "max")
}

export async function moveEventAction(
  id: string,
  startMs: number,
  endMs: number,
): Promise<void> {
  await serverApiFetch(`/api/calendar/events/${id}/move`, {
    method: "PATCH",
    body: { startMs, endMs },
  })
  revalidateTag(EVENTS_TAG, "max")
}

/**
 * Flush a queue of pending drag-moves to the API in one transaction.
 *
 * Called by `useEventDrag` once the user has stopped moving events
 * (debounced) or the page is being unloaded. The Server Action
 * collapses the queue to a single `POST /api/calendar/events/batch-move`
 * round-trip — N drags → 1 HTTP → 1 DB transaction → 1 realtime publish.
 *
 * Returns the events the server actually persisted (in the order
 * applied) so the client can reconcile any optimistic updates that
 * raced with a server-side rejection.
 */
export async function batchMoveEventsAction(
  moves: BatchMoveEntry[],
): Promise<{ events: { id: string; startMs: number; endMs: number }[] }> {
  if (moves.length === 0) return { events: [] }
  const res = await serverApiFetch<{
    events: { id: string; startMs: number; endMs: number }[]
  }>("/api/calendar/events/batch-move", {
    method: "POST",
    body: { moves },
  })
  revalidateTag(EVENTS_TAG, "max")
  return res
}

export async function deleteEventAction(id: string): Promise<void> {
  await serverApiFetch(`/api/calendar/events/${id}`, {
    method: "DELETE",
  })
  revalidateTag(EVENTS_TAG, "max")
}
