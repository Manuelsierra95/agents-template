import { type ReactNode } from "react"

/**
 * Main pane container. The sidebar inset already provides the visible card
 * frame (surface bg, radius, shadow); this just fills the inset so route
 * content can stretch edge-to-edge without stacking a second card on top.
 */
export function WorkspacePane({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </section>
  )
}

export function WorkspacePaneSkeleton({
  titleWidth = "w-24",
}: {
  titleWidth?: string
}) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-hidden
    >
      <div className="flex h-11 shrink-0 items-center border-b border-line px-4">
        <div className={`h-3 ${titleWidth} animate-pulse rounded bg-muted`} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        <div className="h-3 w-72 animate-pulse rounded bg-muted" />
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      </div>
    </section>
  )
}
