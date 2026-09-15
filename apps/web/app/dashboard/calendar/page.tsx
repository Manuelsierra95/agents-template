// TODO(fase 2): reactivar el módulo calendar — falta por implementar.
// El componente original vivía en `apps/web/features/calendar/` y
// montaba `CalendarShell`. Mientras la feature no exista, devolvemos
// un placeholder dentro del `WorkspacePane` para que el sidebar
// siga siendo navegable.
//
// import { Suspense } from "react"
// import { WorkspacePane } from "@/components/layout/workspace-pane"
// import { CalendarShell } from "@/features/calendar/components/calendar-shell"
// import { WorkspaceSkeleton } from "@/features/calendar/components/workspace/workspace-skeleton"
//
// export default function CalendarPage() {
//   return (
//     <WorkspacePane>
//       <Suspense fallback={<WorkspaceSkeleton />}>
//         <CalendarShell />
//       </Suspense>
//     </WorkspacePane>
//   )
// }

import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Auth-gated placeholder. The redirect logic lives in
 * `app/dashboard/layout.tsx`; this page only renders the
 * "próximamente" surface inside the workspace pane.
 *
 * `instant = false` opts the route out of the static-shell validation
 * pass: the route's parent layout redirects on missing sessions,
 * so the static shell can't be validated here.
 */
export const instant = false

export default function CalendarPage() {
  return (
    <WorkspacePane>
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
            Calendar
          </p>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            Próximamente
          </h1>
          <p className="text-[13px] text-ink-2">
            La gestión de calendario se reintroducirá en una fase posterior.
          </p>
        </header>
      </div>
    </WorkspacePane>
  )
}
