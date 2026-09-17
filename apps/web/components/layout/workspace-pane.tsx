import { type ReactNode } from "react"

/**
 * Layout container for every dashboard route. Sits inside `SidebarInset`
 * (which owns the chrome: rounded-3xl, bg-surface-2, shadow-surface-2 and
 * the m-2 padding) and stays transparent — no rounded corners, no
 * background, no shadow of its own.
 *
 * Contract for every direct child:
 *   - Use `flex min-h-0 flex-1 flex-col` so the chain can shrink to fit
 *     the inset. Anything that needs to scroll (`overflow-auto`) lives
 *     one level deeper, inside the feature component or in an explicit
 *     `PageViewport`.
 *   - Never set `overflow-hidden` here: the inset already clips, and an
 *     extra scroll container here would steal the sticky/overflow
 *     context from the real scroll container inside the feature.
 */
export function WorkspacePane({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </section>
  )
}