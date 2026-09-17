"use client"

import {
  Calendar03Icon,
  Cursor02Icon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  TimeScheduleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"

// These three live in the calendar component tree and are ported in parallel.
import { EventCreate } from "../components/event-create"
import { EventDetail } from "../components/event-detail"
import { EventEdit } from "../components/event-edit"
import {
  dockVariants,
  dockVariantsReduced,
  SCRIM_ENTER,
  SCRIM_EXIT,
  SPRING_DOCK,
} from "../components/motion"
import { useListBookings } from "@/lib/mocks/use-bookings"
import type { Booking, CalendarEvent } from "@/lib/mocks/types"
import { useAvailabilityEdit } from "./availability-edit-context"
import {
  AvailabilityPanel,
  useAvailabilityPanelData,
} from "./availability-panel"
import { BookingRequestPanel } from "./booking-request-panel"
import { useDock, type DockView } from "./dock-context"
import { shouldToggleSearchShortcut } from "./search-interactions"
import { SearchPanel } from "./search-panel"
import { SettingsPanelSkeleton } from "./settings-skeleton"
import { isEditableShortcutTarget } from "./shortcuts"
import { useSyncNow } from "./use-sync-now"

const MAX_TIMEOUT_MS = 2_147_000_000

const loadSettingsPanel = () =>
  import("./settings-panel").then((m) => ({ default: m.SettingsPanel }))

const SettingsPanelLazy = lazy(loadSettingsPanel)

/** Each view gets its own width so the shell visibly adapts to what it holds.
 * Padding is deliberately not part of this — every panel shares one inset. */
function widthClass(view: DockView | null): string {
  if (!view) return ""
  if (view.kind === "availability") return "w-[min(30rem,100%)]"
  if (view.kind === "settings") return "w-[min(52rem,100%)]"
  return "w-[min(27rem,100%)]"
}

/** The collapsed nav is a pill; the panels are cards, so they round less. */
function cornerRadius(view: DockView | null): number {
  return view ? 20 : 28
}

export function BottomIsland() {
  const { view, viewId, direction, open, close, openCreate } = useDock()
  const {
    editing,
    setEditing,
    ready: availabilityEditReady,
  } = useAvailabilityEdit()
  const reduce = useReducedMotion()

  useEffect(() => {
    const warm = () => void loadSettingsPanel().catch(() => {})
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm)
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(warm, 1_500)
    return () => window.clearTimeout(id)
  }, [])

  const availabilityOpen = view?.kind === "availability"
  const [availabilityIntentVersion, setAvailabilityIntentVersion] = useState(0)
  const [availabilityRequested, setAvailabilityRequested] = useState(false)
  const availabilityDataActive =
    availabilityOpen || availabilityRequested || availabilityIntentVersion > 0

  const availabilityData = useAvailabilityPanelData()
  const pendingBookings = availabilityData.pendingBookings as
    | Booking[]
    | undefined
  const bookingPage = availabilityData.page
  const bookingDefaults = availabilityData.defaults
  const availabilityReady =
    pendingBookings !== undefined &&
    bookingPage !== undefined &&
    bookingDefaults !== undefined

  const [now, setNow] = useState(() => Date.now())
  const availabilityInstance = useRef(0)
  const allBookings = useListBookings()
  const activePendingBookings = useMemo(
    () => allBookings.filter((b) => b.endMs > now),
    [allBookings, now]
  )
  const ref = useRef<HTMLElement>(null)
  const expanded = view !== null

  const closeCurrent = close

  useEffect(() => {
    if (
      availabilityOpen ||
      availabilityRequested ||
      availabilityIntentVersion === 0
    )
      return
    const timeout = setTimeout(() => setAvailabilityIntentVersion(0), 10_000)
    return () => clearTimeout(timeout)
  }, [availabilityOpen, availabilityRequested, availabilityIntentVersion])

  useEffect(() => {
    if (!availabilityRequested) return
    if (view !== null) {
      setAvailabilityRequested(false)
      return
    }
    if (!availabilityReady) return
    setAvailabilityRequested(false)
    availabilityInstance.current += 1
    open({ kind: "availability" })
  }, [availabilityRequested, availabilityReady, view, open])

  const prepareAvailability = () => {
    setAvailabilityIntentVersion((version) => version + 1)
  }

  const requestAvailability = () => {
    prepareAvailability()
    if (availabilityReady) {
      availabilityInstance.current += 1
      open({ kind: "availability" })
      return
    }
    setAvailabilityRequested(true)
  }

  const nextEndMs = activePendingBookings.reduce<number | undefined>(
    (nearest, booking) =>
      nearest === undefined || booking.endMs < nearest
        ? booking.endMs
        : nearest,
    undefined
  )
  useEffect(() => {
    if (nextEndMs === undefined) return
    let timeout: ReturnType<typeof setTimeout>
    const schedule = () => {
      const remaining = nextEndMs - Date.now()
      if (remaining <= 0) {
        setNow(Date.now())
        return
      }
      timeout = setTimeout(schedule, Math.min(remaining, MAX_TIMEOUT_MS))
    }
    schedule()
    return () => clearTimeout(timeout)
  }, [nextEndMs])

  // No scrim, so dismissal is wired by hand: Escape, or a pointer outside the dock.
  useEffect(() => {
    if (!expanded && !editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (editing) setEditing(false)
      else closeCurrent()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return close()
      if (ref.current?.contains(target)) return
      if (target.closest("[data-event]")) return
      if (
        target.closest(
          "[data-slot='popover-content'],[data-slot='dropdown-menu-content'],[data-slot='goo-dropdown-content']"
        )
      )
        return
      if (target.closest("[data-dock-keep-open]")) return
      close()
    }
    window.addEventListener("keydown", onKey)
    const frame =
      view?.kind === "create" || view?.kind === "edit" || editing
        ? null
        : requestAnimationFrame(() => {
            window.addEventListener("pointerdown", onPointerDown)
          })
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [expanded, view?.kind, close, closeCurrent, editing, setEditing])

  const searchOpen = view?.kind === "search"
  const draftOpen = view?.kind === "create" || view?.kind === "edit"
  useEffect(() => {
    if (editing || draftOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (
        !shouldToggleSearchShortcut(e, {
          searchOpen,
          editableTarget: isEditableShortcutTarget(e.target),
        })
      )
        return
      e.preventDefault()
      if (searchOpen) close()
      else open({ kind: "search" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editing, draftOpen, searchOpen, open, close])

  const variants = reduce ? dockVariantsReduced : dockVariants
  const timed = (transition: typeof SCRIM_ENTER) =>
    reduce ? { duration: 0 } : transition

  return (
    <>
      <AnimatePresence>
        {view?.kind === "settings" && (
          <motion.div
            key="settings-scrim"
            aria-hidden
            className="fixed inset-0 z-30 bg-background/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: timed(SCRIM_ENTER) }}
            exit={{ opacity: 0, transition: timed(SCRIM_EXIT) }}
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <motion.nav
          ref={ref}
          layout
          transition={SPRING_DOCK}
          data-dock-view-transition="bottom-island"
          style={{
            borderRadius: editing ? 28 : cornerRadius(view),
            willChange: "transform",
          }}
          className={cn(
            "pointer-events-auto overflow-hidden border border-black/20 bg-white shadow-lg dark:border-border dark:bg-popover",
            editing
              ? "py-1.5 pr-1.5 pl-4"
              : view
                ? view.kind === "settings"
                  ? "p-0"
                  : "p-4"
                : "px-2 py-1.5",
            !editing && widthClass(view)
          )}
        >
          <motion.div layout="position">
            <AnimatePresence
              mode="popLayout"
              initial={false}
              custom={direction}
            >
              <motion.div
                key={editing ? "availability-edit" : (viewId ?? "nav")}
                custom={direction}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                style={{ willChange: "transform, filter" }}
              >
                {editing ? (
                  <AvailabilityEditBar
                    ready={availabilityEditReady}
                    onDone={() => setEditing(false)}
                  />
                ) : view?.kind === "event" ? (
                  <EventDetail
                    event={view.event}
                    onClose={closeCurrent}
                    onEdit={() => open({ kind: "edit", event: view.event })}
                    onDuplicate={(
                      prefill:
                        | { summary?: string; description?: string }
                        | undefined,
                      startMs: number,
                      endMs: number
                    ) => open({ kind: "create", startMs, endMs, prefill })}
                  />
                ) : view?.kind === "edit" ? (
                  <EventEdit
                    event={view.event}
                    onCancel={() => open({ kind: "event", event: view.event })}
                    onSaved={() => open({ kind: "event", event: view.event })}
                  />
                ) : view?.kind === "create" ? (
                  <EventCreate
                    startMs={view.startMs}
                    endMs={view.endMs}
                    prefill={view.prefill}
                    onChangeRange={(startMs: number, endMs: number) =>
                      open({ ...view, startMs, endMs })
                    }
                    onCancel={closeCurrent}
                    onCreated={closeCurrent}
                  />
                ) : view?.kind === "settings" ? (
                  <Suspense fallback={<SettingsPanelSkeleton />}>
                    <SettingsPanelLazy
                      initialSection={view.section}
                      onClose={closeCurrent}
                    />
                  </Suspense>
                ) : view?.kind === "availability" ? (
                  <AvailabilityPanel
                    key={availabilityInstance.current}
                    pendingBookings={pendingBookings}
                    page={bookingPage}
                    defaults={bookingDefaults}
                    onClose={closeCurrent}
                  />
                ) : view?.kind === "booking" ? (
                  <BookingRequestPanel
                    booking={view.booking}
                    onClose={closeCurrent}
                  />
                ) : view?.kind === "search" ? (
                  <SearchPanel onClose={closeCurrent} />
                ) : (
                  <NavRow
                    pendingCount={activePendingBookings.length}
                    onOpenSettings={() => open({ kind: "settings" })}
                    onOpenSearch={() => open({ kind: "search" })}
                    onCreate={openCreate}
                    availabilityLoading={availabilityRequested}
                    onPrepareAvailability={prepareAvailability}
                    onOpenAvailability={requestAvailability}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.nav>
      </div>
    </>
  )
}

/** The dock's face while painting availability: the same island, morphed into a
 * heads-up bar. Done leaves the mode, and the booking-link panel underneath
 * takes the dock back. */
function AvailabilityEditBar({
  ready,
  onDone,
}: {
  ready: boolean
  onDone: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap">
      {ready ? (
        <HugeiconsIcon
          icon={Cursor02Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-chart-2"
        />
      ) : (
        <Spinner />
      )}
      <p className="text-sm">
        <span className="font-medium">
          {ready ? "Setting availability" : "Loading availability"}
        </span>
        {ready && (
          <span className="hidden text-muted-foreground sm:inline">
            {" · "}drag a day to add, click a block to remove
          </span>
        )}
      </p>
      <Button
        type="button"
        size="compact"
        className="rounded-full"
        onClick={onDone}
      >
        Done
      </Button>
    </div>
  )
}

function NavRow({
  pendingCount,
  availabilityLoading,
  onOpenSettings,
  onOpenSearch,
  onCreate,
  onPrepareAvailability,
  onOpenAvailability,
}: {
  pendingCount: number
  availabilityLoading: boolean
  onOpenSettings: () => void
  onOpenSearch: () => void
  onCreate: () => void
  onPrepareAvailability: () => void
  onOpenAvailability: () => void
}) {
  const { sync, isSyncing } = useSyncNow()

  return (
    <div className="flex items-center gap-1">
      <NavButton
        icon={Calendar03Icon}
        iconClassName="translate-x-px"
        label={isSyncing ? "Syncing calendar" : "Sync calendar"}
        active
        busy={isSyncing}
        onClick={sync}
      />
      <NavButton icon={Search01Icon} label="Search" onClick={onOpenSearch} />
      <NavButton icon={PlusSignIcon} label="Create" onClick={onCreate} />
      <NavButton
        icon={TimeScheduleIcon}
        label={
          pendingCount > 0
            ? `Booking link · ${pendingCount} pending`
            : "Booking link"
        }
        badge={pendingCount}
        busy={availabilityLoading}
        onIntent={onPrepareAvailability}
        onClick={onOpenAvailability}
      />

      <div className="mx-1 h-6 w-px bg-border" />

      <NavButton
        icon={Settings01Icon}
        label="Settings"
        onClick={onOpenSettings}
      />
    </div>
  )
}

function NavButton({
  icon,
  iconClassName,
  label,
  active,
  busy,
  badge,
  onIntent,
  onClick,
}: {
  icon: IconSvgElement
  iconClassName?: string
  label: string
  active?: boolean
  busy?: boolean
  badge?: number
  onIntent?: () => void
  onClick?: () => void
}) {
  return (
    <Tooltip content={label} side="top">
      <button
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        aria-busy={busy || undefined}
        disabled={busy}
        onPointerEnter={onIntent}
        onPointerDown={onIntent}
        onFocus={onIntent}
        onClick={onClick}
        className={cn(
          "hover:bg-accent relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground",
          active && "bg-accent rounded-l-2xl rounded-r-lg text-foreground"
        )}
      >
        {busy ? (
          <Spinner className={cn("size-5", iconClassName)} />
        ) : (
          <HugeiconsIcon
            icon={icon}
            strokeWidth={2}
            className={cn("size-5", iconClassName)}
          />
        )}
        {badge ? (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-medium text-primary-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
    </Tooltip>
  )
}
