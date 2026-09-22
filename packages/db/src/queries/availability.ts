import type { DbClient } from "@workspace/db"
import { listBookingsForDay } from "@workspace/db/queries/bookings"

/**
 * Availability — currently a stub.
 *
 * The agent's `check_availability` tool asks "is HH:mm on YYYY-MM-DD
 * open?". For the demo we consider any half-hour slot between 09:00
 * and 17:00 that does not already carry a `pending` or `confirmed`
 * booking as available.
 *
 * Real availability (staff schedules, services with duration, blocked
 * time, holidays) lives behind `apps/api` once the business logic
 * catches up. This stub gives the agent something truthful to answer
 * with during development.
 */

export type Slot = { start: string; end: string }
const OPENING_HOUR = 9
const CLOSING_HOUR = 17

/**
 * Half-hour slots in `[OPENING_HOUR, CLOSING_HOUR)` for the given
 * date. `slot.end` is exclusive — the next slot starts there.
 *
 * The `date` parameter is accepted for future per-date overrides
 * (e.g. weekends reduced hours); for now every day is the same.
 */
function candidateSlots(date: string): Slot[] {
  void date // reserved for per-date overrides
  const slots: Slot[] = []
  for (let hour = OPENING_HOUR; hour < CLOSING_HOUR; hour++) {
    for (const minute of [0, 30]) {
      const nextHour = minute === 30 ? hour + 1 : hour
      const nextMinute = minute === 30 ? 0 : 30
      slots.push({
        start: `${pad(hour)}:${pad(minute)}`,
        end: `${pad(nextHour)}:${pad(nextMinute)}`,
      })
    }
  }
  return slots
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Return the open slots for a given date in the given organization.
 *
 * `date` is `YYYY-MM-DD`. Returns an empty array for unknown dates
 * or when every slot is already booked.
 */
export async function listAvailableSlots(
  db: DbClient,
  args: { organizationId: string; date: string },
): Promise<Slot[]> {
  const taken = await listBookingsForDay(db, args)
  const takenTimes = new Set(taken.map((b) => b.time))
  return candidateSlots(args.date).filter((slot) => !takenTimes.has(slot.start))
}
