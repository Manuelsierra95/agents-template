/**
 * Calendar event types — single source of truth on the web side.
 *
 * Derived from `@workspace/contracts/calendar` Zod schemas so a contract
 * drift fails loudly at validation time. The shape mirrors the DB
 * `calendar_event` row except:
 *
 *   - `createdAt` / `updatedAt` are ISO strings (the API serialises
 *     `timestamptz` that way).
 *   - `description` / `location` / `color` are nullable (the DB columns
 *     are nullable too).
 *
 * The UI components (`event-create`, `event-edit`, `event-detail`, …)
 * consume `CalendarEvent` directly; mutations go through the hooks in
 * `features/calendar/hooks/use-calendar-events.ts` and the Server
 * Actions in `features/calendar/actions/calendar-events.ts`.
 *
 * `CalendarListItem` is re-exported from the mocks so event-form /
 * event-controls can share the same type. It will move to a dedicated
 * types file once the calendars mock is replaced.
 */
import type {
  CalendarEventWire,
  CalendarEventStatus,
  CreateEventInput,
  UpdateEventInput,
  MoveEventInput,
  ListEventsQuery,
} from "@workspace/contracts/calendar"

export type {
  CalendarEventWire,
  CalendarEventStatus,
  CreateEventInput,
  UpdateEventInput,
  MoveEventInput,
  ListEventsQuery,
}

/**
 * UI-facing alias for the wire shape. Identical today; the alias exists
 * so future UI-only fields (e.g. an optimistic `isPending` flag) can be
 * added without touching every import site.
 */
export type CalendarEvent = CalendarEventWire

/**
 * Per-event capability gating. Lives in the UI layer because the
 * backend doesn't enforce it (an organisation can always edit its own
 * events; the rule is "did *I* create this one?").
 */
export type EventCapabilities = {
  canEdit: boolean
  canDelete: boolean
}

export type { CalendarListItem } from "@/lib/mocks/types"
