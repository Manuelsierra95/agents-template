import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Auth-gated placeholder. Same reasoning as
 * `app/dashboard/calendar/page.tsx` — the redirect logic is in the
 * parent layout; this page only renders the "próximamente" surface.
 */
export const instant = false

/**
 * `/dashboard/agents` placeholder.
 *
 * Lives inside the auth-gated dashboard layout so the sidebar remains
 * mounted. The real `Agents` feature (CRUD of agent personas, tools,
 * knowledge base) is not part of this phase — `apps/web/features/agents/`
 * was not migrated. The page is a thin Server Component that renders a
 * "próximamente" card inside the workspace pane.
 *
 * TODO(fase 2): sustituir por `WorkspacePane` + `AgentsList` cuando el
 * feature de agentes se reintroduzca.
 */
export default function AgentsPage() {
  return (
    <WorkspacePane>
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
            Agents
          </p>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            Próximamente
          </h1>
          <p className="text-[13px] text-ink-2">
            La gestión de agentes se reintroducirá en una fase posterior.
          </p>
        </header>
      </div>
    </WorkspacePane>
  )
}
