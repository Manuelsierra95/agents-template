"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

import { usePreferences } from "@/components/workspace/preferences-context";
import { useUpdateEvent } from "@/features/calendar/hooks/use-calendar-events";
import { useListCalendars } from "@/lib/mocks/use-calendars";
import type { CalendarEvent, CalendarListItem, UpdateEventInput } from "@/lib/calendar/types";

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
type EventPatch = UpdateEventInput;

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
    patch.description = next.description || null;
  }
  if (next.location !== initial.location) {
    patch.location = next.location.trim() || null;
  }
  if (next.color !== initial.color) {
    patch.color = next.color ?? null;
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
  };
  // Captured once: the baseline every save diffs against. Re-seeding it from
  // `event` would erase edits in progress each time a sync lands.
  const [initial] = useState(() => formValueFromEvent(event, timeZone));
  const [value, setValue] = useState<EventFormValue>(initial);
  const [saving, setSaving] = useState(false);

  const valid = isEventFormValid(value);

  const save = () => {
    if (!valid || saving) return;
    // The working zone: the form composed its times in it, so it is the
    // honest label and recurrence anchor.
    const patch = diffEvent(initial, value, event, timeZone);
    if (Object.keys(patch).length === 0) {
      onSaved();
      return;
    }
    setSaving(true);
    updateEvent.mutate(
      { id: event.id, patch },
      {
        onSuccess: () => {
          onSaved();
        },
        onError: (error) => {
          setSaving(false);
          toast.error("Couldn't save event", {
            description: error instanceof Error ? error.message : undefined,
          });
        },
      },
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save();
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
      }
    />
  );
}
