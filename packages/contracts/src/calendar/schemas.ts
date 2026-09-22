import { z } from "zod"

/**
 * Wire contracts for the `/api/calendar/events` namespace.
 *
 * Every Server Component and Client Component that touches calendar
 * events goes through these schemas, so a drift between the API and
 * the UI fails loudly at validation time instead of silently rendering
 * `undefined`.
 *
 * `CalendarEventWire` is the shape returned by the API. It's a strict
 * superset of what the UI consumes — clients derive their internal type
 * from this schema via `z.infer`.
 *
 * Status values mirror the DB enum `calendar_event_status` defined in
 * `@workspace/db/schema/events`. Keep them in sync when adding new ones.
 */

export const CalendarEventStatusSchema = z.enum(["confirmed", "cancelled"])
export type CalendarEventStatus = z.infer<typeof CalendarEventStatusSchema>

/**
 * Wire shape for one event. `createdAt` / `updatedAt` are ISO-8601
 * strings because the API serialises `timestamptz` that way; the UI
 * converts them to `Date` only where it needs to format.
 */
export const CalendarEventWireSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().min(1),
  createdBy: z.string().min(1).nullable(),
  summary: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  allDay: z.boolean(),
  color: z.string().nullable(),
  status: CalendarEventStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CalendarEventWire = z.infer<typeof CalendarEventWireSchema>

/**
 * Envelope returned by every list / single endpoint. Keeps the response
 * shape forward-compatible — we can add metadata (pagination, totals,
 * …) without breaking callers that only read `.events`.
 */
export const CalendarEventListSchema = z.object({
  events: z.array(CalendarEventWireSchema),
})

export const CalendarEventEnvelopeSchema = z.object({
  event: CalendarEventWireSchema,
})

/**
 * POST `/api/calendar/events` body. Required fields are `summary`,
 * `startMs`, `endMs`. Everything else defaults server-side.
 *
 * `endMs > startMs` is enforced at the API layer with a refinement; a
 * malformed range returns 400 `INVALID_EVENT`.
 */
export const CreateEventInputSchema = z
  .object({
    summary: z.string().min(1).max(500),
    description: z.string().max(8000).optional(),
    location: z.string().max(500).optional(),
    startMs: z.number().int(),
    endMs: z.number().int(),
    allDay: z.boolean().optional(),
    color: z.string().min(1).max(20).optional(),
  })
  .refine((v) => v.endMs > v.startMs, {
    message: "endMs must be greater than startMs",
    path: ["endMs"],
  })
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>

/**
 * PATCH `/api/calendar/events/:id` body. All fields optional; only the
 * keys the caller sends are touched.
 *
 * `startMs` and `endMs` may be patched independently. The API checks
 * the invariant `endMs > startMs` against the resulting row.
 */
export const UpdateEventInputSchema = z
  .object({
    summary: z.string().min(1).max(500).optional(),
    description: z.string().max(8000).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    startMs: z.number().int().optional(),
    endMs: z.number().int().optional(),
    allDay: z.boolean().optional(),
    color: z.string().min(1).max(20).nullable().optional(),
    status: CalendarEventStatusSchema.optional(),
  })
  .refine(
    (v) =>
      v.startMs === undefined ||
      v.endMs === undefined ||
      v.endMs > v.startMs,
    {
      message: "endMs must be greater than startMs",
      path: ["endMs"],
    },
  )
export type UpdateEventInput = z.infer<typeof UpdateEventInputSchema>

export const MoveEventInputSchema = z
  .object({
    startMs: z.number().int(),
    endMs: z.number().int(),
  })
  .refine((v) => v.endMs > v.startMs, {
    message: "endMs must be greater than startMs",
    path: ["endMs"],
  })
export type MoveEventInput = z.infer<typeof MoveEventInputSchema>

/**
 * One element of a batch move — the same shape as `MoveEventInput`
 * but keyed by event id. The id is a UUID string validated by the
 * route handler before persistence.
 */
export const BatchMoveEntrySchema = z
  .object({
    id: z.string().uuid(),
    startMs: z.number().int(),
    endMs: z.number().int(),
  })
  .refine((v) => v.endMs > v.startMs, {
    message: "endMs must be greater than startMs",
    path: ["endMs"],
  })
export type BatchMoveEntry = z.infer<typeof BatchMoveEntrySchema>

/**
 * POST `/api/calendar/events/batch-move` body — many moves in one
 * transaction. Empty batches are rejected with 400 so the client can
 * detect its own misuse (the dashboard's drag flow only flushes when
 * there is something to send).
 *
 * The batch is idempotent on the row set but not on the operation: a
 * duplicate `id` is allowed and the second entry wins (last write
 * per id, in array order).
 */
export const BatchMoveEventsInputSchema = z.object({
  moves: z.array(BatchMoveEntrySchema).min(1).max(500),
})
export type BatchMoveEventsInput = z.infer<typeof BatchMoveEventsInputSchema>

/**
 * Response envelope for a batch move — the updated events in the
 * order they were applied. The client uses this to reconcile its
 * pending-changes queue.
 */
export const BatchMoveEventsResponseSchema = z.object({
  events: z.array(CalendarEventWireSchema),
})
export type BatchMoveEventsResponse = z.infer<typeof BatchMoveEventsResponseSchema>

/**
 * GET `/api/calendar/events` query. Both bounds required — the API
 * uses `start_ms <= toMs AND end_ms >= fromMs` (range overlap) so
 * callers must commit to a window. There is intentionally no
 * unbounded list endpoint.
 */
export const ListEventsQuerySchema = z.object({
  fromMs: z.coerce.number().int(),
  toMs: z.coerce.number().int(),
})
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>
