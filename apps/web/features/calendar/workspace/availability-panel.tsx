"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Calendar03Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  dockVariants,
  dockVariantsReduced,
  SPRING_DOCK,
} from "../components/motion"
import { useListBookings } from "@/lib/mocks/use-bookings"
import type { Booking } from "@/lib/mocks/types"
import { useAvailabilityEdit } from "./availability-edit-context"
import { usePreferences } from "./preferences-context"
import { PendingRequestsList } from "./booking-request-panel"
import { TimeField } from "./time-field"

/** Weekdays in display order, matching the grid's Monday-first week. */
const WEEKDAYS = [
  { weekday: 1, label: "Mon" },
  { weekday: 2, label: "Tue" },
  { weekday: 3, label: "Wed" },
  { weekday: 4, label: "Thu" },
  { weekday: 5, label: "Fri" },
  { weekday: 6, label: "Sat" },
  { weekday: 0, label: "Sun" },
]

const SLOT_CHOICES = [15, 30, 45, 60]

/** One editable row per weekday. */
interface DayRow {
  enabled: boolean
  startMin: number
  endMin: number
}

interface WeeklyRule {
  weekday: number
  startMin: number
  endMin: number
}

interface AvailabilityPage {
  slug: string
  title?: string
  rules: WeeklyRule[]
  slotMinutes: number
  minNoticeMinutes: number
  horizonDays: number
  enabled: boolean
  timeZone: string
}

interface AvailabilityDefaults {
  suggestedSlug: string
}

interface AvailabilityPanelProps {
  pendingBookings: Booking[] | undefined
  page: AvailabilityPage | undefined
  defaults: AvailabilityDefaults | undefined
  onClose: () => void
}

const DEFAULT_ROW: DayRow = {
  enabled: false,
  startMin: 9 * 60,
  endMin: 17 * 60,
}

function rowsFromRules(rules: WeeklyRule[]): Record<number, DayRow> {
  const rows: Record<number, DayRow> = {}
  for (const { weekday } of WEEKDAYS) {
    const rule = rules.find((r) => r.weekday === weekday)
    rows[weekday] = rule
      ? { enabled: true, startMin: rule.startMin, endMin: rule.endMin }
      : { ...DEFAULT_ROW }
  }
  return rows
}

function NumberStepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const setValue = (next: number) =>
    onChange(Math.min(max, Math.max(min, next)))

  return (
    <div className="flex h-8 items-center rounded-3xl bg-input/50 px-1 focus-within:ring-3 focus-within:ring-ring/30">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => setValue(value - 1)}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground disabled:opacity-50"
      >
        −
      </button>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) setValue(next)
        }}
        className="h-8 w-full min-w-0 flex-1 [appearance:textfield] rounded-none border-0 bg-transparent px-1 text-center focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => setValue(value + 1)}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground disabled:opacity-50"
      >
        +
      </button>
    </div>
  )
}

/**
 * The host's side of the booking link. In the demo the booking page itself
 * is mocked, so the persistent settings (slug, slot length, notice, horizon,
 * enabled, title) live in local UI state and the "Save" button just toasts a
 * pretend save — only the per-day interval painter writes through to the
 * mock store (via `useAvailabilityEdit`).
 */
export function AvailabilityPanel({
  pendingBookings,
  page,
  defaults,
  onClose,
}: AvailabilityPanelProps) {
  const reduce = useReducedMotion()

  if (
    page === undefined ||
    (page === null && defaults === undefined) ||
    pendingBookings === undefined
  ) {
    return (
      <motion.div
        initial={false}
        animate={{ height: 160 }}
        transition={reduce ? { duration: 0 } : SPRING_DOCK}
        className="flex items-center justify-center overflow-hidden"
      >
        <Spinner />
      </motion.div>
    )
  }

  return (
    <AvailabilityForm
      pendingBookings={pendingBookings}
      page={page}
      defaults={defaults}
      onClose={onClose}
    />
  )
}

function AvailabilityForm({
  pendingBookings,
  page,
  defaults,
  onClose,
}: Omit<AvailabilityPanelProps, "pendingBookings" | "page"> & {
  pendingBookings: Booking[]
  page: AvailabilityPage
}) {
  const { setEditing } = useAvailabilityEdit()
  const { timeZone } = usePreferences()
  const reduce = useReducedMotion()
  const initial = page ?? defaults
  const lastInitial = useRef(initial)
  const dirty = useRef(false)
  const editVersion = useRef(0)
  const mainRef = useRef<HTMLDivElement>(null)
  const requestsRef = useRef<HTMLDivElement>(null)
  const openRequestsOnMount = useRef(pendingBookings.length > 0)

  const [slug, setSlug] = useState(
    () => page?.slug ?? defaults?.suggestedSlug ?? ""
  )
  const [title, setTitle] = useState(() => page?.title ?? "")
  const [rows, setRows] = useState<Record<number, DayRow>>(() =>
    rowsFromRules(initial && "rules" in initial ? initial.rules : [])
  )
  const [slotMinutes, setSlotMinutes] = useState(page?.slotMinutes ?? 30)
  const [noticeHours, setNoticeHours] = useState(
    Math.round((page?.minNoticeMinutes ?? 120) / 60)
  )
  const [horizonDays, setHorizonDays] = useState(page?.horizonDays ?? 60)
  const [enabled, setEnabled] = useState(page?.enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [screen, setScreen] = useState<"main" | "requests">("main")
  const [direction, setDirection] = useState<-1 | 1>(1)
  const [mainHeight, setMainHeight] = useState<number>()
  const [requestsHeight, setRequestsHeight] = useState<number>()

  useLayoutEffect(() => {
    if (!openRequestsOnMount.current) return
    openRequestsOnMount.current = false
    setMainHeight(mainRef.current?.offsetHeight)
    setDirection(1)
    setScreen("requests")
  }, [])

  useEffect(() => {
    if (initial === lastInitial.current) return
    lastInitial.current = initial
    if (!initial || !("rules" in initial) || dirty.current) return
    setSlug((initial as AvailabilityPage).slug ?? "")
    setTitle((initial as AvailabilityPage).title ?? "")
    setRows(rowsFromRules((initial as AvailabilityPage).rules))
    setSlotMinutes((initial as AvailabilityPage).slotMinutes)
    setNoticeHours(
      Math.round((initial as AvailabilityPage).minNoticeMinutes / 60)
    )
    setHorizonDays((initial as AvailabilityPage).horizonDays)
    setEnabled((initial as AvailabilityPage).enabled)
  }, [initial])

  useEffect(() => {
    const element = screen === "main" ? mainRef.current : requestsRef.current
    if (!element) return

    const measure = () => {
      const height = element.offsetHeight
      if (screen === "main") setMainHeight(height)
      else setRequestsHeight(height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [screen])

  const markDirty = () => {
    dirty.current = true
    editVersion.current += 1
  }

  const rules = useMemo(
    () =>
      WEEKDAYS.filter(({ weekday }) => rows[weekday]?.enabled)
        .map(({ weekday }) => {
          const row = rows[weekday]
          if (!row) return null
          return {
            weekday,
            startMin: row.startMin,
            endMin: row.endMin,
          }
        })
        .filter(
          (rule): rule is WeeklyRule =>
            rule !== null && rule.endMin > rule.startMin
        ),
    [rows]
  )

  const openDayCount = WEEKDAYS.filter(
    ({ weekday }) => rows[weekday]?.enabled
  ).length
  const dateEditorBlocked = rules.length === 0
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const publicUrl = `${origin}/${slug}`
  const variants = reduce ? dockVariantsReduced : dockVariants
  void publicUrl

  const openRequests = () => {
    setMainHeight(mainRef.current?.offsetHeight)
    setDirection(1)
    setScreen("requests")
  }

  const returnToMain = () => {
    setDirection(-1)
    setScreen("main")
  }

  const patchRow = (weekday: number, patch: Partial<DayRow>) => {
    markDirty()
    setRows((prev) => {
      const prevRow = prev[weekday] ?? DEFAULT_ROW
      const next: Record<number, DayRow> = {
        ...prev,
        [weekday]: {
          enabled: patch.enabled ?? prevRow.enabled,
          startMin: patch.startMin ?? prevRow.startMin,
          endMin: patch.endMin ?? prevRow.endMin,
        },
      }
      return next
    })
  }

  const copyRowToAll = (weekday: number) => {
    markDirty()
    setRows((prev) => {
      const source = prev[weekday]
      if (!source) return prev
      const { startMin, endMin } = source
      const next: Record<number, DayRow> = { ...prev }
      for (const { weekday: wd } of WEEKDAYS) {
        if (wd !== weekday && next[wd]?.enabled) {
          next[wd] = { ...next[wd], startMin, endMin }
        }
      }
      return next
    })
    toast.success("Hours copied to all open days")
  }

  const persist = async (showSuccess: boolean): Promise<boolean> => {
    if (rules.length === 0) return false
    const savedVersion = editVersion.current
    setSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 200))
      if (editVersion.current === savedVersion) {
        dirty.current = false
      }
      if (showSuccess) {
        toast.success(enabled ? "Booking link is live" : "Booking link saved")
      }
      return true
    } catch (error: unknown) {
      toast.error("Couldn't save your booking link", {
        description: error instanceof Error ? error.message : undefined,
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const openDateEditor = async () => {
    if (rules.length === 0) return
    if (await persist(false)) setEditing(true)
  }
  void timeZone

  return (
    <motion.div
      initial={false}
      animate={{
        height:
          screen === "main"
            ? (mainHeight ?? "auto")
            : (requestsHeight ?? mainHeight ?? "auto"),
      }}
      transition={reduce ? { duration: 0 } : SPRING_DOCK}
      className="overflow-hidden"
    >
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        {screen === "requests" ? (
          <motion.div
            key="requests"
            ref={requestsRef}
            custom={direction}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ maxHeight: mainHeight }}
            className="flex flex-col gap-3 overflow-hidden"
          >
            <button
              type="button"
              onClick={returnToMain}
              className="-ml-1 flex items-center gap-1 self-start rounded-lg px-1 py-0.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              Booking link
            </button>
            <div>
              <p className="text-sm font-medium">Pending requests</p>
              <p className="text-xs text-muted-foreground">
                {pendingBookings.length === 1
                  ? "1 person is waiting for a response"
                  : `${pendingBookings.length} people are waiting for a response`}
              </p>
            </div>
            <PendingRequestsList
              pending={pendingBookings}
              onDone={() => {
                if (pendingBookings.length === 1) returnToMain()
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            ref={mainRef}
            custom={direction}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-col gap-3 overflow-hidden"
          >
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Booking link</p>
                <p className="truncate text-xs text-muted-foreground">
                  Share it and people can request a time
                </p>
              </div>
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

            {pendingBookings.length > 0 && (
              <button
                type="button"
                onClick={openRequests}
                className="group flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-sm font-medium">Pending requests</span>
                  <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground">
                    {pendingBookings.length}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">Review</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </button>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex h-9 min-w-0 flex-1 items-center gap-0 rounded-3xl bg-input/50 pl-3 focus-within:ring-3 focus-within:ring-ring/30">
                  <span className="shrink-0 truncate text-sm text-muted-foreground">
                    {origin.replace(/^https?:\/\//, "")}/
                  </span>
                  <input
                    value={slug}
                    onChange={(e) => {
                      markDirty()
                      setSlug(e.target.value)
                    }}
                    placeholder="your-name"
                    aria-label="Booking link name"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="h-9 flex-1 bg-transparent pl-0.5 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none"
                  />
                </div>
              </div>
            </div>

            <input
              value={title}
              onChange={(e) => {
                markDirty()
                setTitle(e.target.value)
              }}
              placeholder="What the meeting is called"
              aria-label="Meeting title"
              className="h-9 w-full rounded-3xl border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />

            <div className="space-y-1.5">
              <p className="px-2 text-xs font-medium text-muted-foreground">
                Weekly hours
              </p>
              <div className="space-y-0.5">
                {WEEKDAYS.map(({ weekday, label }) => {
                  const row = rows[weekday]
                  if (!row) return null
                  return (
                    <div
                      key={weekday}
                      className="group flex items-center gap-2.5 rounded-2xl px-1 py-1"
                    >
                      <Switch
                        label=""
                        checked={row.enabled}
                        onToggle={() =>
                          patchRow(weekday, { enabled: !row.enabled })
                        }
                        aria-label={`${label} available`}
                      />
                      <span
                        className={cn(
                          "w-9 shrink-0 text-sm font-medium transition-colors",
                          !row.enabled && "text-muted-foreground/60"
                        )}
                      >
                        {label}
                      </span>
                      <div className="flex flex-1 items-center gap-1.5">
                        <TimeField
                          value={row.startMin}
                          onChange={(minutes) =>
                            patchRow(weekday, { startMin: minutes })
                          }
                          disabled={!row.enabled}
                          aria-label={`${label} start`}
                          className="flex-1"
                        />
                        <span
                          className={cn(
                            "text-xs transition-colors",
                            row.enabled
                              ? "text-muted-foreground"
                              : "text-muted-foreground/50"
                          )}
                        >
                          to
                        </span>
                        <TimeField
                          value={row.endMin}
                          onChange={(minutes) =>
                            patchRow(weekday, { endMin: minutes })
                          }
                          mode="end"
                          disabled={!row.enabled}
                          aria-label={`${label} end`}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex size-6 shrink-0 items-center justify-center">
                        {row.enabled && openDayCount > 1 && (
                          <Tooltip content="Copy to all open days">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-compact"
                              aria-label="Copy to all open days"
                              onClick={() => copyRowToAll(weekday)}
                              className="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                            >
                              <HugeiconsIcon
                                icon={Copy01Icon}
                                strokeWidth={2}
                                className="size-4"
                              />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {rules.length === 0 && (
                <p className="px-2 text-xs text-destructive">
                  Open at least one day
                </p>
              )}
            </div>

            <Tooltip
              content="Open at least one day"
              forceOpen={dateEditorBlocked}
            >
              <button
                type="button"
                aria-disabled={dateEditorBlocked}
                onClick={() => {
                  if (dateEditorBlocked) return
                  void openDateEditor()
                }}
                className="group flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-muted/60"
              >
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={2}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    Set specific dates
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {dateEditorBlocked
                      ? "Open at least one day first"
                      : "Save these settings, then paint individual days"}
                  </span>
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </button>
            </Tooltip>

            <div className="space-y-1.5">
              <p className="px-2 text-xs font-medium text-muted-foreground">
                Slot length
              </p>
              <div
                role="group"
                aria-label="Slot length"
                className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1"
              >
                {SLOT_CHOICES.map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    variant="ghost"
                    size="compact"
                    aria-pressed={slotMinutes === minutes}
                    className="rounded-xl px-2 text-muted-foreground hover:bg-background/60 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:hover:bg-background/40 aria-pressed:dark:border-white/5"
                    onClick={() => {
                      markDirty()
                      setSlotMinutes(minutes)
                    }}
                  >
                    {minutes}m
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="booking-notice-hours"
                  className="block px-2 text-xs font-medium text-muted-foreground"
                >
                  Notice (hours)
                </label>
                <NumberStepper
                  id="booking-notice-hours"
                  label="Notice in hours"
                  min={0}
                  max={720}
                  value={noticeHours}
                  onChange={(value) => {
                    markDirty()
                    setNoticeHours(value)
                  }}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="booking-horizon-days"
                  className="block px-2 text-xs font-medium text-muted-foreground"
                >
                  Days ahead
                </label>
                <NumberStepper
                  id="booking-horizon-days"
                  label="Days ahead"
                  min={1}
                  max={365}
                  value={horizonDays}
                  onChange={(value) => {
                    markDirty()
                    setHorizonDays(value)
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2.5">
                <Switch
                  label=""
                  checked={enabled}
                  onToggle={() => {
                    markDirty()
                    setEnabled(!enabled)
                  }}
                  aria-label={
                    enabled ? "Booking link is live" : "Booking link is paused"
                  }
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="relative flex size-2 items-center justify-center">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          enabled ? "bg-chart-2" : "bg-muted-foreground/40"
                        )}
                      />
                      {enabled && !reduce && (
                        <span className="absolute size-2 animate-ping rounded-full bg-chart-2 opacity-60" />
                      )}
                    </span>
                    {enabled ? "Live" : "Paused"}
                  </span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {enabled
                      ? "People can request a time"
                      : "Hidden — not taking requests"}
                  </span>
                </span>
              </label>
              <Tooltip
                content="Open at least one day"
                forceOpen={rules.length === 0}
              >
                <Button
                  type="button"
                  size="compact"
                  disabled={rules.length === 0}
                  aria-disabled={rules.length === 0}
                  className={cn(
                    "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary",
                    saving && "opacity-80"
                  )}
                  onClick={() => void persist(true)}
                >
                  {saving && <Spinner />}
                  {saving ? "Saving…" : "Save"}
                </Button>
              </Tooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Bridge from the dock to the booking mock data — passes the active pending
 * bookings through. Exposed as a hook so the dock renders the panel without
 * knowing about the booking model directly. */
export function useAvailabilityPanelData(): {
  pendingBookings: Booking[] | undefined
  page: AvailabilityPage | undefined
  defaults: AvailabilityDefaults | undefined
} {
  const bookings = useListBookings()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
  }, [])
  const pendingBookings = useMemo(
    () => (now == null ? bookings : bookings.filter((b) => b.endMs > now)),
    [bookings, now]
  )
  // In the demo there is no real booking page on a backend, but the panel
  // needs a typed `page` with rules/slot lengths. The defaults below mirror
  // the seed's working profile so weekly hours render naturally.
  const page: AvailabilityPage = {
    slug: "demo",
    title: "Quick chat",
    timeZone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
    rules: [
      { weekday: 1, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 2, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 3, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 4, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 5, startMin: 9 * 60, endMin: 17 * 60 },
    ],
    slotMinutes: 30,
    minNoticeMinutes: 120,
    horizonDays: 60,
    enabled: true,
  }
  return {
    pendingBookings,
    page,
    defaults: { suggestedSlug: "demo" },
  }
}
