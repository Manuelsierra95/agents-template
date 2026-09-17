"use client"

import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  PencilEdit01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  calendarDisplayName,
  groupCalendarsByAccount,
  isWritableCalendar,
  type CalendarListItem,
} from "../components/lib"
import { calendarColorVar } from "../components/colors"
import {
  dockVariants,
  dockVariantsReduced,
  SPRING_DOCK,
} from "../components/motion"
import {
  useListCalendars,
  useListConnections,
  useSetCalendarSelected,
} from "@/lib/mocks/use-calendars"
import {
  useMyPreferences,
  useMyUser,
  useSetPreferences,
} from "@/lib/mocks/use-preferences"
import {
  DESKTOP_QUERY,
  SECTIONS,
  SETTINGS_ACTIVE_ROW,
  SETTINGS_PANE,
  type SettingsSection,
} from "./settings-layout"

export type { SettingsSection }

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  )
}

function reportSaveError(message: string) {
  return (error: unknown) =>
    toast.error(message, {
      description: error instanceof Error ? error.message : undefined,
    })
}

/** Toast stubs for the demo: every write here is a no-op. */
const demoToast = async (action: string): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  toast(`${action}: saved (demo)`)
}

/**
 * The full-bloom settings sheet. Every actual write is a no-op toast in this
 * demo — preferences write through the mock; connection/calendar mutations
 * just toast. The shape stays identical to the production version.
 */
export function SettingsPanel({
  initialSection,
  onClose,
}: {
  initialSection?: SettingsSection
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const isDesktop = useIsDesktop()
  const [section, setSection] = useState<SettingsSection>(
    initialSection ?? "calendars"
  )
  const [mobileScreen, setMobileScreen] = useState<"nav" | "section">(
    initialSection ? "section" : "nav"
  )
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()

  useEffect(() => {
    const element = innerRef.current
    if (!element) return
    const measure = () => setHeight(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const variants = reduce ? dockVariantsReduced : dockVariants

  const goTo = (next: SettingsSection) => {
    const from = SECTIONS.findIndex((s) => s.id === section)
    const to = SECTIONS.findIndex((s) => s.id === next)
    setDirection(to === from ? 0 : to > from ? 1 : -1)
    setSection(next)
    setMobileScreen("section")
  }

  const backToNav = () => {
    setDirection(-1)
    setMobileScreen("nav")
  }

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!

  const sectionContent =
    section === "calendars" ? <CalendarsSection /> : <PreferencesSection />

  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={reduce ? { duration: 0 } : SPRING_DOCK}
      className="overflow-hidden"
    >
      <div ref={innerRef}>
        {isDesktop ? (
          <div className={cn("grid", SETTINGS_PANE)}>
            <nav
              aria-label="Settings sections"
              className="flex flex-col gap-1 border-r border-border bg-muted p-3"
            >
              <p className="px-3 pt-1.5 pb-2.5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Settings
              </p>
              {SECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={entry.id === section || undefined}
                  onClick={() => goTo(entry.id)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    entry.id === section
                      ? SETTINGS_ACTIVE_ROW
                      : "dark:hover:bg-accent/50 hover:bg-background/60"
                  )}
                >
                  <HugeiconsIcon
                    icon={entry.icon}
                    strokeWidth={2}
                    className={cn(
                      "size-4 shrink-0",
                      entry.id === section
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      entry.id === section
                        ? "font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {entry.label}
                  </span>
                </button>
              ))}
            </nav>
            <div className="relative flex h-full min-h-0 flex-col p-5 pl-6">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover:bg-accent absolute top-4 right-4 z-10 flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </button>
              <AnimatePresence
                mode="popLayout"
                initial={false}
                custom={direction}
              >
                <motion.div
                  key={section}
                  custom={direction}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <h2 className="font-display shrink-0 pr-9 text-2xl font-bold">
                    {active.label}
                  </h2>
                  <div className="mt-4 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2 pb-1 [scrollbar-width:thin]">
                    {sectionContent}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <AnimatePresence
              mode="popLayout"
              initial={false}
              custom={direction}
            >
              {mobileScreen === "nav" ? (
                <motion.div
                  key="nav"
                  custom={direction}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-display min-w-0 flex-1 text-2xl font-bold">
                      Settings
                    </h2>
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
                  <div className="flex flex-col gap-1.5">
                    {SECTIONS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => goTo(entry.id)}
                        className="group flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <HugeiconsIcon
                          icon={entry.icon}
                          strokeWidth={2}
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium">
                            {entry.label}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {entry.description}
                          </span>
                        </span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          strokeWidth={2}
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={section}
                  custom={direction}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex flex-col gap-3"
                >
                  <button
                    type="button"
                    onClick={backToNav}
                    className="-ml-1 flex items-center gap-1 self-start rounded-lg px-1 py-0.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HugeiconsIcon
                      icon={ArrowLeft01Icon}
                      strokeWidth={2}
                      className="size-4 text-muted-foreground"
                    />
                    Settings
                  </button>
                  <h2 className="font-display text-2xl font-bold">
                    {active.label}
                  </h2>
                  {sectionContent}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function SettingCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-3xl bg-muted/50 px-4", className)}>
      {children}
    </div>
  )
}

function SettingRow({
  title,
  description,
  destructiveDescription,
  control,
}: {
  title: ReactNode
  description?: ReactNode
  destructiveDescription?: boolean
  control?: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p
            className={cn(
              "mt-0.5 text-xs",
              destructiveDescription
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        )}
      </div>
      {control && <div className="flex shrink-0 items-center">{control}</div>}
    </div>
  )
}

function isWritable(calendar: CalendarListItem): boolean {
  return true && isWritableCalendar(calendar)
}

function sortCalendars(calendars: CalendarListItem[]): CalendarListItem[] {
  return [...calendars].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return calendarDisplayName(a).localeCompare(calendarDisplayName(b))
  })
}

const CALENDAR_GRID =
  "grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] items-center gap-3"

function CalendarsSection() {
  const connections = useListConnections()
  const calendars = useListCalendars()
  const user = useMyUser()

  if (calendars.length === 0) {
    return (
      <SettingCard>
        <p className="py-8 text-center text-xs text-muted-foreground">
          No calendars yet — they appear after your first sync.
        </p>
      </SettingCard>
    )
  }
  return (
    <div className="space-y-4">
      {connections.map((connection) => {
        const matching = calendars.filter((c) => c.accountId === connection._id)
        const rows = sortCalendars(matching)
        if (rows.length === 0) return null
        return (
          <div key={connection._id} className="space-y-1.5">
            <p className="truncate px-1 text-xs font-medium text-muted-foreground">
              {connection.email ||
                (connections.length === 1 ? user.email : undefined) ||
                "Connected account"}
            </p>
            <SettingCard>
              <div
                aria-hidden
                className={cn(
                  CALENDAR_GRID,
                  "border-b border-border py-2.5 text-xs font-medium text-muted-foreground"
                )}
              >
                <span>Calendar</span>
                <span>Color</span>
                <span>Type</span>
              </div>
              {rows.map((calendar) => (
                <CalendarTableRow key={calendar._id} calendar={calendar} />
              ))}
            </SettingCard>
          </div>
        )
      })}
    </div>
  )
}

function calendarType(calendar: CalendarListItem): string {
  if (calendar.primary) return "Primary"
  if (
    calendar.accessRole === "reader" ||
    calendar.accessRole === "freeBusyReader"
  )
    return "Read-only"
  return "Regular"
}

function CalendarTableRow({
  calendar,
}: {
  calendar: CalendarListItem & { selected?: boolean }
}) {
  const setSelected = useSetCalendarSelected()
  const [editing, setEditing] = useState(false)
  const name = calendarDisplayName(calendar)
  const colorVar = calendarColorVar(calendar)

  const commit = (value: string) => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed === name) return
    void demoToast("Rename").catch(
      reportSaveError("Couldn't rename the calendar")
    )
  }

  return (
    <div
      className={cn(
        CALENDAR_GRID,
        "group border-b border-border py-3 last:border-b-0"
      )}
      style={{ "--cal-color": `var(${colorVar})` } as CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Checkbox
          checked={calendar.selected ?? true}
          onCheckedChange={(checked) =>
            void setSelected({
              calendarId: calendar._id,
              selected: checked === true,
            }).catch(reportSaveError("Couldn't update the calendar"))
          }
          aria-label={`Show ${name}`}
          className="size-5 rounded-md border-(--cal-color) transition-colors data-checked:border-(--cal-color) data-checked:bg-(--cal-color) data-checked:text-white dark:data-checked:bg-(--cal-color)"
        />
        {editing ? (
          <Input
            autoFocus
            defaultValue={name}
            aria-label={`Rename ${name}`}
            className="h-7 flex-1 rounded-md bg-background px-2 text-sm"
            onFocus={(event) => event.target.select()}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                setEditing(false)
              }
              if (event.key === "Enter") commit(event.currentTarget.value)
            }}
          />
        ) : (
          <span className="h-7 min-w-0 flex-1 truncate text-sm leading-7 font-medium">
            {name}
          </span>
        )}
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="icon-compact"
            aria-label={`Rename ${name}`}
            onClick={() => setEditing(true)}
            className="text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <HugeiconsIcon
              icon={PencilEdit01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </Button>
        )}
      </div>
      <span
        className="h-3.5 w-7 rounded-full"
        style={{ backgroundColor: `var(${colorVar})` }}
      />
      <span className="truncate text-sm text-muted-foreground">
        {calendarType(calendar)}
      </span>
    </div>
  )
}

const WEEK_START_OPTIONS = [
  { label: "Mon", value: 1 },
  { label: "Sun", value: 0 },
  { label: "Sat", value: 6 },
] as const

const TIME_FORMAT_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "12h", value: "12h" },
  { label: "24h", value: "24h" },
] as const

const DEFAULT_VIEW_OPTIONS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
] as const

function PreferencesSection() {
  const prefs = useMyPreferences()
  const calendars = useListCalendars()
  const connections = useListConnections()
  const setPrefs = useSetPreferences()
  const browserZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  )

  const writable = sortCalendars(calendars).filter(isWritable)
  const defaultCalendar =
    writable.find((c) => c._id === prefs.defaultCalendarId) ?? null
  const grouped = groupCalendarsByAccount(writable, connections)

  const save = async (patch: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    setPrefs(patch as Parameters<typeof setPrefs>[0])
    toast("Preferences saved (demo)")
  }

  return (
    <SettingCard>
      <SettingRow
        title="Week starts on"
        description="First day of the calendar week"
        control={
          <Segmented
            label="Week starts on"
            options={WEEK_START_OPTIONS}
            value={prefs.weekStartsOn as 0 | 1 | 6}
            onChange={(value) => void save({ weekStartsOn: value })}
          />
        }
      />
      <SettingRow
        title="Time format"
        description="Auto follows the 12-hour clock"
        control={
          <Segmented
            label="Time format"
            options={TIME_FORMAT_OPTIONS}
            value={(prefs.timeFormat ?? "12h") as "12h" | "24h" | "auto"}
            onChange={(value) =>
              value === "auto"
                ? void save({ timeFormat: "12h" })
                : void save({ timeFormat: value })
            }
          />
        }
      />
      <SettingRow
        title="Default view"
        description="What the calendar opens to"
        control={
          <Segmented
            label="Default view"
            options={DEFAULT_VIEW_OPTIONS}
            value={prefs.defaultView}
            onChange={(value) => void save({ defaultView: value })}
          />
        }
      />
      {writable.length > 0 && (
        <SettingRow
          title="Default calendar"
          description="Where new events land unless you pick one"
          control={
            <PickerRow
              label={
                defaultCalendar
                  ? calendarDisplayName(defaultCalendar)
                  : "Automatic"
              }
              swatchVar={
                defaultCalendar ? calendarColorVar(defaultCalendar) : undefined
              }
              ariaLabel="Default calendar for new events"
            >
              {(close) => (
                <div className="flex flex-col gap-0.5">
                  <PickerOption
                    label="Automatic · primary calendar"
                    selected={!defaultCalendar}
                    onSelect={() => {
                      close()
                      void save({ defaultCalendarId: null })
                    }}
                  />
                  {grouped.map((group) => (
                    <div key={group.key} className="flex flex-col gap-0.5">
                      {grouped.length > 1 && group.label && (
                        <p className="truncate px-2.5 pt-1 text-[11px] font-medium text-muted-foreground">
                          {group.label}
                        </p>
                      )}
                      {group.calendars.map((calendar) => (
                        <PickerOption
                          key={calendar._id}
                          label={calendarDisplayName(calendar)}
                          swatchVar={calendarColorVar(calendar)}
                          selected={calendar._id === defaultCalendar?._id}
                          onSelect={() => {
                            close()
                            void save({ defaultCalendarId: calendar._id })
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </PickerRow>
          }
        />
      )}
      <SettingRow
        title="Time zone"
        description="Your calendar and booking page run in this zone"
        control={
          <TimeZonePicker
            value={prefs.timeZone}
            browserZone={browserZone}
            onSelect={(zone) =>
              zone === null
                ? void save({ timeZone: browserZone })
                : void save({ timeZone: zone })
            }
          />
        }
      />
    </SettingCard>
  )
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { label: string; value: T }[]
  value: T | undefined
  onChange: (value: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-1 rounded-lg bg-background p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((option) => (
        <Button
          key={String(option.label)}
          type="button"
          variant="ghost"
          size="compact"
          aria-pressed={value === option.value}
          className="rounded-md px-2.5 text-muted-foreground hover:bg-muted/60 aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:shadow-sm"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function PickerRow({
  label,
  swatchVar,
  ariaLabel,
  children,
}: {
  label: string
  swatchVar?: string
  ariaLabel: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex h-8 max-w-52 items-center gap-2 rounded-lg bg-background px-3 text-left transition-colors outline-none hover:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {swatchVar && (
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: `var(${swatchVar})` }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 rotate-90 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

function PickerOption({
  label,
  swatchVar,
  selected,
  onSelect,
}: {
  label: string
  swatchVar?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-2xl px-2.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-muted/60"
      )}
    >
      {swatchVar && (
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${swatchVar})` }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && (
        <HugeiconsIcon
          icon={Tick02Icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
      )}
    </button>
  )
}

function TimeZonePicker({
  value,
  browserZone,
  onSelect,
}: {
  value: string | undefined
  browserZone: string
  onSelect: (zone: string | null) => void
}) {
  const [filter, setFilter] = useState("")
  const zones = useMemo(() => {
    try {
      return (Intl as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf
        ? Intl.supportedValuesOf("timeZone")
        : [browserZone]
    } catch {
      return [browserZone]
    }
  }, [browserZone])
  const needle = filter.trim().toLowerCase().replace(/\s+/g, "_")
  const matches = needle
    ? zones.filter((zone) => zone.toLowerCase().includes(needle))
    : zones

  return (
    <PickerRow
      label={value ?? `Automatic · ${browserZone.replace(/_/g, " ")}`}
      ariaLabel="Time zone"
    >
      {(close) => (
        <div className="flex flex-col gap-1">
          <Input
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search time zones"
            aria-label="Search time zones"
            className="h-8 rounded-2xl"
          />
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {!needle && (
              <PickerOption
                label={`Automatic · ${browserZone.replace(/_/g, " ")}`}
                selected={value === undefined}
                onSelect={() => {
                  close()
                  setFilter("")
                  onSelect(null)
                }}
              />
            )}
            {matches.map((zone) => (
              <PickerOption
                key={zone}
                label={zone.replace(/_/g, " ")}
                selected={zone === value}
                onSelect={() => {
                  close()
                  setFilter("")
                  onSelect(zone)
                }}
              />
            ))}
            {matches.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                No matching time zones
              </p>
            )}
          </div>
        </div>
      )}
    </PickerRow>
  )
}
