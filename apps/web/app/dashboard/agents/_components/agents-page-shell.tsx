"use client"

import { Suspense, type ReactNode } from "react"

/**
 * Route-specific shell for `/dashboard/agents`.
 *
 * Owns the Suspense boundary that protects the streamed subtree. Keeping
 * it here — and out of `page.tsx` — means the route can be removed in one
 * delete and the Server Component stays a thin wrapper.
 *
 * Composition follows `web-ssr-suspense-skeletons` §5 Pattern 2: the
 * boundary receives the page content as `children`, so when the real
 * `Agents` feature lands (an async Server Component fetching agent
 * personas / tools / knowledge base), the streamed leaf slots in without
 * touching the route file or the Suspense primitive.
 *
 * The wrapper is `flex min-h-0 flex-1 flex-col` so any descendant — whether
 * a sync leaf (`<AgentsPageContent />`) or a future async SC — sits
 * inside the same flex chain the rest of the dashboard uses. Without it,
 * the children would be a direct child of `WorkspacePane` and could grow
 * outside the inset, which would push scroll back up to `<body>`.
 *
 * **No `fallback` is set on the inner Suspense.** The route-level
 * `loading.tsx` (rendered by Next.js *outside* `page.tsx`) already owns
 * the entire-route fallback (`<AgentsSkeleton />`). Adding a second
 * fallback here would only matter for async leaves inside the shell —
 * add one specific to the section that actually awaits when that leaf
 * ships (e.g. `<AgentsListSkeleton />`), never a generic shell fallback.
 *
 * When the feature is reintroduced, this is also the right place to add
 * any route-specific Client Context Providers the feature needs (e.g.
 * an `AgentsFilterContext` or selection store).
 */
export function AgentsPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense>{children}</Suspense>
    </div>
  )
}