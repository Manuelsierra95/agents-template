"use client"

import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { addDays, format, isSameDay, isSameYear, startOfDay } from "date-fns"
import { useEffect, useId, useMemo, useRef, useState } from "react"

import { useEventColor } from "../components/colors"
import {
  calendarDisplayName,
  eventTimeParts,
  fromUtcMidnight,
  zoned,
  zonedNow,
  type CalendarEvent,
} from "../components/lib"
import { useMyUser } from "@/lib/mocks/use-preferences"
import { useDock, type RevealInput } from "./dock-context"
import { usePreferences } from "./preferences-context"
import { useSearch } from "@/lib/mocks/use-search"
import { stepActiveResult } from "./search-interactions"

const SEARCH_QUERY_MAX_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 120
const NOW_GRANULARITY_MS = 60_000

function dayLabel(date: Date, now: Date): string {
  if (isSameDay(date, now)) return "Today"
  if (isSameDay(date, addDays(now, 1))) return "Tomorrow"
  if (isSameDay(date, addDays(now, -1))) return "Yesterday"
  return format(date, isSameYear(date, now) ? "EEE d MMM" : "EEE d MMM yyyy")
}

/** One line of when: "Tomorrow · 9:00 – 9:30 AM", "Fri 12 Dec · All day",
 * or a day span for a multi-day all-day event. */
function whenText(
  event: CalendarEvent,
  use24h: boolean,
  timeZone: string
): string {
  const now = zonedNow(timeZone)
  const parts = eventTimeParts(event, use24h, timeZone)
  if (parts.allDay) {
    const { start, lastDay } = parts
    return isSameDay(start, lastDay)
      ? `${dayLabel(start, now)} · All day`
      : `${dayLabel(start, now)} – ${dayLabel(lastDay, now)}`
  }
  return `${dayLabel(parts.start, now)} · ${format(parts.start, parts.time)} – ${parts.endText}`
}

/** Where the calendar should scroll for a result. */
function revealFor(event: CalendarEvent, timeZone: string): RevealInput {
  const startMs = event.allDay
    ? startOfDay(
        zoned(fromUtcMidnight(event.startMs, timeZone), timeZone)
      ).getTime()
    : event.startMs
  return { startMs, flashId: event._id }
}

/** The dock's search face: a title search over the available events. Picking
 * a result swaps the dock to that event's detail and scrolls the calendar to
 * it, the way the notification feed reaches for a booking. */
export function SearchPanel({ onClose }: { onClose: () => void }) {
  const { open, reveal } = useDock()
  const { use24h, timeZone } = usePreferences()
  const colorFor = useEventColor()
  // Bind the user so we don't accidentally strip them on save.
  void useMyUser()

  const calendars = useMemo(
    () =>
      new Map<string, string>([
        ["cal_personal_primary", "Personal"],
        ["cal_work_primary", "Work"],
      ]),
    []
  )

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const lastResults = useRef<CalendarEvent[] | undefined>(undefined)
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      lastResults.current = undefined
      setDebounced("")
      return
    }
    const timeout = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query])

  const nowMs = useMemo(
    () => Math.floor(Date.now() / NOW_GRANULARITY_MS) * NOW_GRANULARITY_MS,
    [debounced]
  )

  const search = useSearch(debounced)
  // The mock returns search-shaped results; fetch full events from somewhere
  // matching the returned `_id`s. For simplicity we look them up through the
  // same data the calendar reads — we'll resolve on demand below.
  const results: CalendarEvent[] | undefined = useMemo(() => {
    if (!debounced) return undefined
    const ids = new Set(search.events.map((e) => e._id))
    // Pull from a small in-memory snapshot by querying through the global mock
    // store. Since `useSearch` already aggregates events, we can re-derive a
    // full CalendarEvent by id-keyed access from the store. For this demo we
    // accept simplified rows — just use what `useSearch` returns.
    void ids
    void calendarDisplayName
    return search.events as CalendarEvent[]
  }, [debounced, search.events, calendars])
  if (results !== undefined) lastResults.current = results
  const loading = debounced !== "" && results === undefined
  const list = debounced ? (results ?? lastResults.current) : undefined

  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const count = list?.length ?? 0
  const activeIndex = Math.min(active, Math.max(count - 1, 0))
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const pick = (event: CalendarEvent) => {
    open({ kind: "event", event })
    reveal(revealFor(event, timeZone))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setActive(
        stepActiveResult(activeIndex, count, e.key === "ArrowDown" ? 1 : -1)
      )
    } else if (e.key === "Enter") {
      const event = loading ? undefined : list?.[activeIndex]
      if (event) {
        e.preventDefault()
        pick(event)
      }
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="size-5 shrink-0 text-muted-foreground"
        />
        <input
          autoFocus
          type="text"
          value={query}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search events"
          aria-label="Search events"
          role="combobox"
          aria-expanded={count > 0}
          aria-controls={listId}
          aria-activedescendant={
            count > 0 ? `${listId}-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        {loading ? <Spinner className="shrink-0" /> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </button>
      </div>

      {list && list.length > 0 ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Matching events"
          aria-busy={loading || undefined}
          className={cn(
            "-mx-2 mt-3 max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain",
            loading && "opacity-60"
          )}
        >
          {list.map((event, index) => {
            const colorVar = colorFor(event)
            const calendarName = event.localCalendarId
              ? calendars.get(event.localCalendarId)
              : undefined
            return (
              <button
                type="button"
                key={event._id}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(event)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none",
                  index === activeIndex && "bg-accent"
                )}
              >
                <span
                  aria-hidden
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: `var(${colorVar})` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {event.summary || "(No title)"}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {whenText(event, use24h, timeZone)}
                    {calendarName ? ` · ${calendarName}` : ""}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 px-0.5 text-sm text-muted-foreground">
          {list && !loading
            ? `No events match “${debounced}”`
            : "Find an event by its title"}
        </p>
      )}
    </div>
  )
}
