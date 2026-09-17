"use client"

import { Suspense, type ReactNode } from "react"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { MocksProvider } from "@/lib/mocks"
import { AvailabilityEditProvider } from "@/features/calendar/workspace/availability-edit-context"
import { BottomIsland } from "@/features/calendar/workspace/bottom-island"
import { DockProvider } from "@/features/calendar/workspace/dock-context"
import { PreferencesProvider } from "@/features/calendar/workspace/preferences-context"

/**
 * Route-specific shell for `/dashboard/calendar`. Owns the Client Context
 * stack (Mocks → Dock → Preferences → AvailabilityEdit → Tooltip) so every
 * leaf below sees the same store, preferences, dock state, availability-edit
 * draft, and shared tooltip group.
 *
 * The shell deliberately avoids its own `<main>`: the dashboard layout's
 * `SidebarInset` already provides the document-level `<main>` landmark
 * (rendered by the sidebar package). Nesting another `<main>` here would
 * create two `<main>` landmarks per route and risk stealing the
 * sticky-toolbar scroll context. `BottomIsland` (the dock) renders as a
 * sibling of the calendar so its `position: fixed` floats above without
 * competing with the scroll container.
 *
 * The outer wrapper omits `overflow-auto` on purpose: the calendar's own
 * `position: sticky` toolbar walks up to `WorkspacePane`'s `overflow-hidden`
 * (and ultimately the document body) as the scroll container. The TimeStrip
 * handles its own vertical scroll — adding another `overflow-auto` here
 * would steal that context and break pinning.
 *
 * Both branches stream behind Suspense so they don't block the static
 * shell — the island's lazy imports and the calendar week view land on
 * independent timelines.
 *
 * Keeping this here — and out of `page.tsx` — means the route can be
 * removed in one delete and the Server Component stays a thin wrapper.
 */
export function CalendarPageShell({ children }: { children: ReactNode }) {
  return (
    <MocksProvider>
      <DockProvider>
        <PreferencesProvider>
          <AvailabilityEditProvider>
            <TooltipProvider>
              <div className="relative flex min-h-0 flex-1 flex-col">
                <Suspense fallback={null}>{children}</Suspense>
                <Suspense fallback={null}>
                  <BottomIsland />
                </Suspense>
              </div>
              <Toaster position="top-right" />
            </TooltipProvider>
          </AvailabilityEditProvider>
        </PreferencesProvider>
      </DockProvider>
    </MocksProvider>
  )
}