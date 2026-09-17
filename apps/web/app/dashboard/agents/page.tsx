import { WorkspacePane } from "@/components/layout/workspace-pane"
import { AgentsPageShell } from "./_components/agents-page-shell"
import { AgentsPageContent } from "./_components/agents-page-content"

/**
 * `/dashboard/agents` placeholder.
 *
 * Lives inside the auth-gated dashboard layout so the sidebar remains
 * mounted. The real `Agents` feature (CRUD of agent personas, tools,
 * knowledge base) is not part of this phase — `apps/web/features/agents/`
 * was not migrated. The page is a thin Server Component that wires
 * `WorkspacePane` + Suspense shell + the placeholder leaf.
 *
 * When the feature is reintroduced, replace `AgentsPageContent` with
 * the async Server Component that fetches agent data (wrap it with
 * `'use cache'` + `cacheTag('agents')` per §6 of the skill).
 */
export default function AgentsPage() {
  return (
    <WorkspacePane>
      <AgentsPageShell>
        <AgentsPageContent />
      </AgentsPageShell>
    </WorkspacePane>
  )
}
