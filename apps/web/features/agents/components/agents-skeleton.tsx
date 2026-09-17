/**
 * Route-level skeleton for `/dashboard/agents`.
 *
 * Mirrors the layout of `apps/web/app/dashboard/agents/_components/agents-page-content.tsx`:
 * an eyebrow label, a h1 title, and a single-line description. Keep widths
 * and gaps in lockstep with the real content — the skeleton must look like
 * the same page with text replaced by pulsing rectangles.
 *
 * Lives next to the feature primitives per `web-ssr-suspense-skeletons` §3
 * (skeletons co-located with the component they shadow).
 */
export function AgentsSkeleton() {
  return (
    <div
      aria-hidden
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      </header>
    </div>
  )
}
