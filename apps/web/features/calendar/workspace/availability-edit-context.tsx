"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { format } from "date-fns"

import type { DayInterval } from "@/lib/mocks/types"
import { MS_PER_MINUTE } from "../components/lib"
import {
  useMyAvailability,
  useSetAvailability,
} from "@/lib/mocks/use-availability"

interface RenderInterval extends DayInterval {
  saving: boolean
}

interface DayAvailability {
  intervals: RenderInterval[]
  isOverride: boolean
}

interface AvailabilityEditValue {
  editing: boolean
  setEditing: (editing: boolean) => void
  ready: boolean
  intervalsForDay: (day: Date) => DayAvailability
  addInterval: (day: Date, startMs: number, endMs: number) => void
  removeInterval: (day: Date, index: number) => void
  resetDay: (day: Date) => void
}

const AvailabilityEditContext = createContext<AvailabilityEditValue | null>(
  null
)

function dayKey(day: Date): string {
  return format(day, "yyyy-MM-dd")
}

function savingId(dateKey: string, interval: DayInterval): string {
  return `${dateKey}:${interval.startMin}-${interval.endMin}`
}

function mergeIntervals(intervals: DayInterval[]): DayInterval[] {
  if (intervals.length === 0) return intervals
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin)
  const first = sorted[0]
  if (!first) return intervals
  const out: DayInterval[] = [
    { startMin: first.startMin, endMin: first.endMin },
  ]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    if (!cur) continue
    const last = out[out.length - 1]
    if (!last) continue
    if (cur.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, cur.endMin)
    } else {
      out.push({ startMin: cur.startMin, endMin: cur.endMin })
    }
  }
  return out
}

export function AvailabilityEditProvider({
  children,
}: {
  children: ReactNode
}) {
  const [editing, setEditingState] = useState(false)
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set())
  const availability = useMyAvailability()
  const setAvailability = useSetAvailability()

  const overrideByDate = useMemo(() => {
    const map = new Map<string, DayInterval[]>()
    for (const a of availability) map.set(a.dayKey, a.intervals)
    return map
  }, [availability])

  const intervalsForDay = useCallback(
    (day: Date): DayAvailability => {
      const key = dayKey(day)
      const override = overrideByDate.get(key)
      const base = override ?? []
      const intervals = base.map((interval) => ({
        ...interval,
        saving: saving.has(savingId(key, interval)),
      }))
      return { intervals, isOverride: override !== undefined }
    },
    [overrideByDate, saving]
  )

  const markSaving = useCallback((id: string, on: boolean) => {
    setSaving((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const addInterval = useCallback(
    (day: Date, startMs: number, endMs: number) => {
      const dayStartMs = day.getTime()
      const startMin = Math.round((startMs - dayStartMs) / MS_PER_MINUTE)
      const endMin = Math.round((endMs - dayStartMs) / MS_PER_MINUTE)
      if (endMin <= startMin) return
      const key = dayKey(day)
      const next = mergeIntervals([
        ...intervalsForDay(day).intervals,
        { startMin, endMin },
      ])
      const landed =
        next.find((i) => i.startMin <= startMin && i.endMin >= endMin) ??
        ({ startMin, endMin } as DayInterval)
      const id = savingId(key, landed)
      markSaving(id, true)
      setAvailability(key, next)
      setTimeout(() => markSaving(id, false), 600)
    },
    [intervalsForDay, markSaving, setAvailability]
  )

  const removeInterval = useCallback(
    (day: Date, index: number) => {
      const next = intervalsForDay(day)
        .intervals.filter((_, i) => i !== index)
        .map(({ startMin, endMin }) => ({ startMin, endMin }))
      setAvailability(dayKey(day), next)
    },
    [intervalsForDay, setAvailability]
  )

  const resetDay = useCallback(
    (day: Date) => {
      setAvailability(dayKey(day), [])
    },
    [setAvailability]
  )

  const value = useMemo<AvailabilityEditValue>(
    () => ({
      editing,
      setEditing: setEditingState,
      ready: true,
      intervalsForDay,
      addInterval,
      removeInterval,
      resetDay,
    }),
    [editing, intervalsForDay, addInterval, removeInterval, resetDay]
  )

  return (
    <AvailabilityEditContext value={value}>{children}</AvailabilityEditContext>
  )
}

export function useAvailabilityEdit(): AvailabilityEditValue {
  const ctx = useContext(AvailabilityEditContext)
  if (!ctx) {
    throw new Error(
      "useAvailabilityEdit must be used within an AvailabilityEditProvider"
    )
  }
  return ctx
}
