"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { UserPreferences } from "@/lib/mocks/types"
import { useMyPreferences } from "@/lib/mocks/use-preferences"
import { WEEK_STARTS_ON, type WeekStart } from "../components/lib"

interface PreferencesValue {
  weekStartsOn: WeekStart
  use24h: boolean
  timeZone: string
  raw: UserPreferences
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

function resolve(raw: UserPreferences): PreferencesValue {
  const w: WeekStart = raw.weekStartsOn === 0 ? 0 : 1
  return {
    weekStartsOn: w,
    use24h: raw.timeFormat === "24h",
    // TODO(user-config): the `raw.timeZone ||` short-circuit at the head of
    // this ternary pins the zone to whatever value the seed captured at
    // module-load time, which on Next 16's prerender path is the *server's*
    // IANA zone, not the user's. Once the user-config endpoint feeds
    // preferences, drop the `raw.timeZone ||` arm entirely — the API value
    // is authoritative and the runtime Intl fallback exists only as a
    // last-resort guard while mocks still ship a `timeZone`.
    timeZone:
      raw.timeZone ||
      (typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC"),
    raw,
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const raw = useMyPreferences()
  const value = useMemo(() => resolve(raw), [raw])
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return ctx
}
