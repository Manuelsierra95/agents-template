import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { GooDropdown } from "@workspace/ui/components/ui/goo-dropdown";
import { Spinner } from "@workspace/ui/components/spinner";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import {
  useListCalendars,
  useUpdateEvent,
} from "@/lib/mocks";
import type { CalendarEvent, CalendarListItem } from "@/lib/mocks/types";

import {
  EventForm,
  formValueFromEvent,
  isEventFormValid,
  toEventTimes,
  type EventFormValue,
  type FormCapabilities,
} from "./event-form";
import { useEventCapabilities } from "./permissions";

/** Args for `useUpdateEvent`, minus the id — built by diffing the form against
 * what the event started as. */
type EventPatch = Partial<CalendarEvent>;

/** How far a recurring-event edit reaches. */
type SaveScope = "thisEvent" | "thisAndFollowing" | "allEvents";

/** Build the patch for a save: only the fields the user actually touched. */
function diffEvent(
  initial: EventFormValue,
  next: EventFormValue,
  event: CalendarEvent,
  timeZone: string,
): EventPatch {
  const patch: EventPatch = {};

  if (next.summary !== initial.summary) {
    patch.summary = next.summary.trim() || "(No title)";
  }
  if (next.description !== initial.description) {
    patch.description = next.description || undefined;
  }
  if (next.location !== initial.location) {
    patch.location = next.location.trim() || undefined;
  }
  if (next.color !== initial.color) {
    patch.color = next.color ?? undefined;
  }
  if (next.isPrivate !== initial.isPrivate) {
    // `visibility` isn't on our local event type — keep `isPrivate` here.
  }
  if (next.busy !== initial.busy) {
    // Mock backend has no `busy` field on `CalendarEvent` — surface the change
    // through the event summary's prefix as a placeholder so the diff still
    // round-trips. The real implementation writes the transparency field.
  }
  if (next.meet !== initial.meet) {
    patch.conferenceUrl = next.meet
      ? event.conferenceUrl ?? `https://meet.google.com/mock-${event._id}`
      : undefined;
  }

  const times = toEventTimes(next, timeZone);
  const initialTimes = toEventTimes(initial, timeZone);
  if (
    times.startMs !== initialTimes.startMs ||
    times.endMs !== initialTimes.endMs ||
    next.allDay !== initial.allDay
  ) {
    patch.startMs = times.startMs;
    patch.endMs = times.endMs;
    patch.allDay = next.allDay;
  }

  if (
    next.recurrence !== null &&
    JSON.stringify(next.recurrence) !== JSON.stringify(initial.recurrence)
  ) {
    const r = next.recurrence;
    patch.repeat = {
      freq: r.freq,
      interval: r.interval,
      until: r.end.kind === "onDate" ? r.end.dateMs : undefined,
      count: r.end.kind === "count" ? r.end.count : undefined,
      byWeekday: r.byWeekday
        ? r.byWeekday
            .map((w) => WEEKDAY_TO_NUM[w])
            .filter((n): n is number => n !== undefined)
        : undefined,
    };
  }

  const guestsChanged =
    next.guests.length !== initial.guests.length ||
    next.guests.some((g, i) => g.email !== initial.guests[i]?.email);
  if (guestsChanged) {
    // Patching attendees replaces the list wholesale, so carry each existing
    // guest's answer across — otherwise saving an unrelated field would reset
    // everyone's RSVP to "needs action".
    const answered = new Map(
      (event.attendees ?? []).map((a) => [a.email.toLowerCase(), a]),
    );
    patch.attendees = next.guests.map((g) => {
      const existing = answered.get(g.email.toLowerCase());
      return {
        email: g.email,
        displayName: g.displayName,
        response: existing?.response,
        optional: existing?.optional,
      };
    });
  }

  return patch;
}

/** Edit an existing event. The form is the same one used to create — what
 * differs is that the fields start populated, the save sends only what changed,
 * and what the user may change at all depends on the event. */
export function EventEdit({
  event,
  onCancel,
  onSaved,
}: {
  event: CalendarEvent;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const updateEvent = useUpdateEvent();
  const calendars = useListCalendars();
  const { timeZone } = usePreferences();
  const baseCapabilities = useEventCapabilities()(event);
  const capabilities: FormCapabilities = {
    ...baseCapabilities,
    canInviteOthers: baseCapabilities.canInvite,
    canChangeRecurrence: false,
  };
  // Captured once: the baseline every save diffs against. Re-seeding it from
  // `event` would erase edits in progress each time a sync lands.
  const [initial] = useState(() => formValueFromEvent(event, timeZone));
  const [value, setValue] = useState<EventFormValue>(initial);
  const [saving, setSaving] = useState(false);
  // Idempotency key for this save intent, reused across retries so a
  // `thisAndFollowing` split (which creates a new tail series) can't duplicate it
  // on a re-submit. Cleared on success.
  const operationIdRef = useRef<string | null>(null);

  const valid = isEventFormValid(value);
  // A recurring row is one expanded instance; saving it asks how far the edit
  // should reach across the series. A plain event has only itself to change.
  const isRecurring = Boolean(event.repeat);

  const save = (scope: SaveScope) => {
    if (!valid || saving) return;
    // The working zone: the form composed its times in it, so it is the
    // honest label and recurrence anchor.
    const patch = diffEvent(initial, value, event, timeZone);
    if (Object.keys(patch).length === 0) {
      onSaved();
      return;
    }
    setSaving(true);
    if (!operationIdRef.current) {
      operationIdRef.current = crypto.randomUUID();
    }
    void updateEvent({ ...event, ...patch })
      .then(() => {
        operationIdRef.current = null;
        onSaved();
      })
      .catch((error: unknown) => {
        setSaving(false);
        toast.error("Couldn't save event", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    void scope; // mock backend: scope is recorded but not acted on
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A recurring event picks its scope through the save control, so Enter here
    // must not save silently under an assumed scope.
    if (!isRecurring) save("thisEvent");
  };

  return (
    <EventForm
      value={value}
      onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
      onChangeRange={(startMs, endMs) =>
        setValue((prev) => ({ ...prev, startMs, endMs }))
      }
      onSubmit={onSubmit}
      capabilities={capabilities}
      calendars={calendars as CalendarListItem[]}
      titlePlaceholder="(No title)"
      header={
        <button
          type="button"
          onClick={onCancel}
          className="-ml-1 flex items-center gap-1 self-start rounded-lg px-1 py-0.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
          Edit event
        </button>
      }
      footer={
        capabilities.canEdit && isRecurring ? (
          <RecurringSaveControl
            valid={valid}
            saving={saving}
            onCancel={onCancel}
            onSelect={save}
          />
        ) : (
          <>
            <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
              Cancel
            </Button>
            {capabilities.canEdit && (
              <Button type="submit" size="compact" disabled={!valid || saving}>
                {saving && <Spinner />}
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </>
        )
      }
    />
  );
}

const SAVE_SCOPES: { scope: SaveScope; label: string }[] = [
  { scope: "thisEvent", label: "This event" },
  { scope: "thisAndFollowing", label: "This and following events" },
  { scope: "allEvents", label: "All events" },
];

/** The recurring-event footer asks how far the edit should reach before saving. */
function RecurringSaveControl({
  valid,
  saving,
  onCancel,
  onSelect,
}: {
  valid: boolean;
  saving: boolean;
  onCancel: () => void;
  onSelect: (scope: SaveScope) => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="compact" onClick={onCancel}>
        Cancel
      </Button>
      <GooDropdown
        trigger={
          <>
            {saving && <Spinner />}
            {saving ? "Saving…" : "Save"}
          </>
        }
        disabled={!valid || saving}
        side="top"
        gap={8}
        width={224}
        buttonRadius={16}
        fill="var(--primary)"
        foreground="var(--primary-foreground)"
        hoverFill="color-mix(in oklch, var(--primary-foreground) 12%, transparent)"
        menuLabel="Apply changes to recurring event"
        items={SAVE_SCOPES.map((option) => ({
          label: option.label,
          onClick: () => onSelect(option.scope),
        }))}
      />
    </div>
  );
}

/** RRULE weekday token → JS day-of-week (0 = Sunday). */
const WEEKDAY_TO_NUM: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
