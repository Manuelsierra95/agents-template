"use client"

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  addDays,
  getISOWeek,
  isSameDay,
  isSameMonth,
  startOfDay,
} from "date-fns"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { GooDropdown } from "@workspace/ui/components/ui/goo-dropdown"
import { cn } from "@workspace/ui/lib/utils"

import { useListCalendars, useListConnections } from "@/lib/mocks/use-calendars"
import { useListEventsInRange } from "@/features/calendar/hooks/use-calendar-events"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useDock } from "../workspace/dock-context"
import { usePreferences } from "../workspace/preferences-context"
import { NotificationBell } from "../workspace/notification-bell"

import { CalendarPager, type CalendarPagerHandle } from "./calendar-pager"
import { calendarColorVar } from "./colors"
import {
  addPages,
  eventQueryRange,
  groupCalendarsByAccount,
  isWritableCalendar,
  type CalendarView,
  dayKey,
  msToPct,
  pageDays,
  pageStart,
  stripDays,
  STRIP_SIDE_DAYS,
  VIEW_BUFFER,
  VIEW_COLUMNS,
  VIEW_NAV_DAYS,
  viewTitle,
  zoned,
  zonedNow,
} from "./lib"
import { MonthPanel } from "./month-panel"
import { MonthPicker } from "./month-picker"
import { TimeStrip, type TimeStripHandle } from "./time-strip"
import { NO_REVEAL, type Reveal } from "./today-pulse"

const VIEWS: CalendarView[] = ["day", "week", "month"]

export function CalendarWeekView() {
  const { weekStartsOn, timeZone } = usePreferences()
  const [view, setView] = useState<CalendarView>("week")
  const [anchor, setAnchor] = useState<Date>(() =>
    pageStart("week", zonedNow(timeZone), weekStartsOn)
  )
  const [reveal, setReveal] = useState<Reveal>(NO_REVEAL)
  const pagerRef = useRef<CalendarPagerHandle>(null)
  const stripRef = useRef<TimeStripHandle>(null)
  const reduce = useReducedMotion()

  const layout = useMemo(() => {
    if (view === "month") {
      const buffer = VIEW_BUFFER.month
      const pageStarts = Array.from({ length: 2 * buffer + 1 }, (_, i) =>
        addPages("month", anchor, i - buffer)
      )
      return {
        mode: "month" as const,
        pageStarts,
        centerIndex: buffer,
      }
    }
    const columns = VIEW_COLUMNS[view]
    const navDays = VIEW_NAV_DAYS[view]
    const side = STRIP_SIDE_DAYS[view]
    return {
      mode: "strip" as const,
      columns,
      navDays,
      anchorIndex: side,
      days: stripDays(anchor, columns, side),
    }
  }, [view, anchor])

  const queryRange = useMemo(
    () => eventQueryRange(view, anchor, weekStartsOn),
    [view, anchor, weekStartsOn]
  )
  const eventsQuery = useListEventsInRange({
    fromMs: queryRange.startMs,
    toMs: queryRange.endMs,
  })
  const events: CalendarEvent[] = eventsQuery.data ?? []
  const calendars = useListCalendars()
  const connections = useListConnections()

  const { registerCreateSeed, registerReveal } = useDock()
  const focusDayMs = useMemo(() => {
    const today = startOfDay(zonedNow(timeZone))
    const onPage = pageDays(view, anchor, weekStartsOn).some((day) =>
      isSameDay(day, today)
    )
    return (onPage ? today : startOfDay(anchor)).getTime()
  }, [view, anchor, weekStartsOn, timeZone])

  useEffect(() => {
    registerCreateSeed({ dayStartMs: focusDayMs, events })
    return () => registerCreateSeed(null)
  }, [registerCreateSeed, focusDayMs, events])

  const step = (dir: number) => {
    if (layout.mode === "month") {
      pagerRef.current?.scrollToIndex(layout.centerIndex + dir, "smooth")
    } else {
      stripRef.current?.scrollToIndex(
        layout.anchorIndex + dir * layout.navDays,
        "smooth"
      )
    }
  }

  const jumpTo = useCallback(
    (date: Date) => {
      setAnchor(pageStart(view, date, weekStartsOn))
    },
    [view, weekStartsOn]
  )

  useEffect(() => {
    setAnchor((current) =>
      pageStart(view, zoned(current.getTime(), timeZone), weekStartsOn)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartsOn, timeZone])

  const handleSettleDeltaDays = useCallback(
    (delta: number) => setAnchor((a) => addDays(a, delta)),
    []
  )
  const handleSettleDeltaPages = useCallback(
    (delta: number) => setAnchor((a) => addPages("month", a, delta)),
    []
  )

  const runTransition = useCallback(
    (name: string, apply: () => void, onFinished?: () => void) => {
      const el = document.documentElement
      if (reduce || typeof document.startViewTransition !== "function") {
        if (onFinished) {
          flushSync(apply)
          onFinished()
        } else {
          apply()
        }
        return
      }
      el.dataset.calTransition = name
      const transition = document.startViewTransition(() => {
        flushSync(apply)
      })
      transition.finished.finally(() => {
        delete el.dataset.calTransition
        onFinished?.()
      })
    },
    [reduce]
  )

  const bumpReveal = (flashId: string) =>
    setReveal((prev) => ({
      id: flashId,
      nonce: prev.nonce + 1,
      at: Date.now(),
    }))

  const revealTarget = (spec: {
    date: Date
    vertical: number | "now" | null
    flashId: string
  }) => {
    const flash = () => bumpReveal(spec.flashId)
    const scrollColumn = (index: number) => {
      if (spec.vertical === "now") {
        stripRef.current?.scrollToTodayColumn(index, flash)
      } else {
        stripRef.current?.scrollToColumn(index, spec.vertical, flash)
      }
    }

    if (layout.mode === "strip") {
      const centerOffset = Math.floor(layout.columns / 2)
      const dayIndex = layout.days.findIndex((d) => isSameDay(d, spec.date))
      const targetIndex = dayIndex - centerOffset
      const maxIndex = layout.days.length - layout.columns
      if (dayIndex !== -1 && targetIndex >= 0 && targetIndex <= maxIndex) {
        scrollColumn(targetIndex)
        return
      }
      const target = addDays(startOfDay(spec.date), -centerOffset)
      const dir = Math.sign(target.getTime() - anchor.getTime())
      if (dir === 0) {
        scrollColumn(Math.max(0, Math.min(targetIndex, maxIndex)))
        return
      }
      if (spec.vertical === "now") stripRef.current?.primeCenterNow()
      else stripRef.current?.primeCenterAt(spec.vertical)
      runTransition(
        dir > 0 ? "slide-fwd" : "slide-back",
        () => setAnchor(target),
        flash
      )
      return
    }

    const monthIndex = layout.pageStarts.findIndex((s) =>
      isSameMonth(s, spec.date)
    )
    if (monthIndex !== -1) {
      pagerRef.current?.scrollToIndex(monthIndex, "smooth", flash)
      return
    }
    const target = pageStart("month", spec.date)
    const dir = Math.sign(target.getTime() - anchor.getTime())
    if (dir === 0) {
      flash()
      return
    }
    runTransition(
      dir > 0 ? "slide-fwd" : "slide-back",
      () => setAnchor(target),
      flash
    )
  }

  const goToToday = () =>
    revealTarget({
      date: zonedNow(timeZone),
      vertical: "now",
      flashId: dayKey(zonedNow(timeZone)),
    })

  const revealItem = (input: { startMs?: number; flashId: string }) => {
    if (input.startMs == null) {
      bumpReveal(input.flashId)
      return
    }
    const date = zoned(input.startMs, timeZone)
    if (layout.mode === "month") {
      revealTarget({ date, vertical: null, flashId: dayKey(date) })
    } else {
      revealTarget({
        date,
        vertical: msToPct(input.startMs, startOfDay(date).getTime()),
        flashId: input.flashId,
      })
    }
  }

  const revealItemRef = useRef(revealItem)
  revealItemRef.current = revealItem
  useEffect(() => {
    registerReveal((input) => revealItemRef.current(input))
    return () => registerReveal(null)
  }, [registerReveal])

  const switchView = (next: CalendarView) => {
    const apply = () => {
      setAnchor(pageStart(next, anchor, weekStartsOn))
      setView(next)
    }
    const granularityDelta = VIEWS.indexOf(next) - VIEWS.indexOf(view)
    if (granularityDelta === 0) {
      apply()
      return
    }
    const isWeekDay =
      (view === "week" && next === "day") || (view === "day" && next === "week")
    const style = isWeekDay ? "width" : "zoom"
    const direction = granularityDelta > 0 ? "out" : "in"
    runTransition(`${style}-${direction}`, apply)
  }

  const openDay = (day: Date) => {
    runTransition("zoom-in", () => {
      setAnchor(pageStart("day", day))
      setView("day")
    })
  }

  const selectedCount = calendars.filter((c) => c.selected).length
  const sorted = [...calendars].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return (a.summary ?? "").localeCompare(b.summary ?? "")
  })
  const grouped = groupCalendarsByAccount(sorted, connections)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        data-dock-keep-open
        // `shrink-0` keeps flexbox from collapsing the toolbar when the body
        // grows under it; combined with `sticky top-0 z-30` it pins to whichever
        // scroll container sits above — normally the inner `<main>` from
        // calendar-page-shell.tsx, but falls back to the document when none
        // captures it (dev tests with smaller viewports where the calendar
        // content fits and `<main>` never scrolls).
        className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-t border-border/80 bg-calendar-header px-4 py-2.5"
      >
        <div className="flex items-center justify-center gap-2 text-sm">
          <MonthPicker
            selectedWeekStart={pageStart("week", anchor, weekStartsOn)}
            onSelect={jumpTo}
          >
            <span className="font-medium">{viewTitle(view, anchor)}</span>
            {view === "week" && (
              <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                W{getISOWeek(anchor)}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </span>
            )}
          </MonthPicker>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg bg-secondary p-0.5 text-sm">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                  v === view
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToToday}
              className="hover:bg-accent rounded-md px-2.5 py-1 text-sm font-medium"
            >
              Today
            </button>
            <NavArrow
              icon={ArrowLeft01Icon}
              label="Previous"
              onClick={() => step(-1)}
            />
            <NavArrow
              icon={ArrowRight01Icon}
              label="Next"
              onClick={() => step(1)}
            />
          </div>

          <CalendarPicker
            calendars={sorted.map((c) => ({ ...c, selected: !!c.selected }))}
          />

          <NotificationBell />
        </div>
      </header>

      <div className="calendar-body-vt flex min-h-0 flex-1 flex-col">
        {layout.mode === "month" ? (
          <CalendarPager
            ref={pagerRef}
            pageStarts={layout.pageStarts}
            centerIndex={layout.centerIndex}
            gutterWidth={0}
            onSettleDelta={handleSettleDeltaPages}
            renderPage={(start) => (
              <MonthPanel
                monthStart={start}
                days={pageDays("month", start, weekStartsOn)}
                events={events}
                onSelectDay={openDay}
                reveal={reveal}
              />
            )}
          />
        ) : (
          <TimeStrip
            ref={stripRef}
            days={layout.days}
            anchorIndex={layout.anchorIndex}
            columns={layout.columns}
            events={events}
            onSettleDeltaDays={handleSettleDeltaDays}
            reveal={reveal}
            timeZone={timeZone}
          />
        )}
      </div>
    </div>
  )
}

type CalendarPickerItem = {
  _id: string
  primary: boolean
  summary?: string
  selected: boolean
  accountId: string
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader"
}

function CalendarPicker({ calendars }: { calendars: CalendarPickerItem[] }) {
  const connections = useListConnections()
  const selectedCount = calendars.filter((c) => c.selected).length
  const grouped = groupCalendarsByAccount(calendars, connections)

  return (
    <GooDropdown
      trigger={
        <>
          <div className="flex items-center -space-x-1.5">
            {calendars
              .filter((c) => c.selected)
              .slice(0, 8)
              .map((c) => (
                <span
                  key={c._id}
                  className="size-4 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: `var(${calendarColorVar(c)})` }}
                />
              ))}
          </div>
          <span className="text-sm">
            {calendars.length === 0
              ? "No calendars"
              : `${selectedCount} of ${calendars.length} calendar${
                  calendars.length === 1 ? "" : "s"
                }`}
          </span>
        </>
      }
      triggerLabel="Choose calendars"
      menuLabel="Calendars"
      panelContent={
        <div className="flex h-full flex-col">
          <p className="flex h-7 shrink-0 items-center px-1 text-xs font-medium opacity-70">
            Calendars
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {grouped.map((group) => (
              <div key={group.key}>
                {grouped.length > 1 && group.label && (
                  <p className="flex h-6 items-center truncate px-1.5 pt-1 text-[11px] font-medium opacity-60">
                    {group.label}
                  </p>
                )}
                {group.calendars.map((cal) => (
                  <label
                    key={cal._id}
                    className="flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 transition-colors hover:bg-[var(--goo-hover-fill)]"
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `var(${calendarColorVar(cal)})`,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {cal.summary ?? "(No name)"}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      }
      contentHeight={28 + Math.min(calendars.length, 8) * 32}
      triggerSound={false}
      align="end"
      side="bottom"
      gap={4}
      width={256}
      buttonRadius={10}
      panelRadius={18}
      fill="transparent"
      foreground="var(--muted-foreground)"
      hoverFill="var(--accent)"
      activeFill="var(--primary)"
      activeForeground="var(--primary-foreground)"
      activeHoverFill="color-mix(in oklch, var(--primary-foreground) 14%, var(--primary))"
      triggerClassName="gap-2 !px-1 rounded-lg hover:bg-accent"
    />
  )
}

function NavArrow({
  icon,
  label,
  onClick,
}: {
  icon: typeof ArrowLeft01Icon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="hover:bg-accent flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
    </button>
  )
}
