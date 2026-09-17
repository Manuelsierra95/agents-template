import { WorkspacePane } from "@/components/layout/workspace-pane"
import { AgentsSkeleton } from "@/features/agents/components/agents-skeleton"

/**
 * Route-level skeleton for `/dashboard/agents`. The placeholder shapes
 * live in `AgentsSkeleton` so the layout (eyebrow + title + description)
 * is mirrored in one place and stays in lockstep with
 * `agents-page-content.tsx`.
 */
export default function AgentsLoading() {
  return (
    <WorkspacePane>
      <AgentsSkeleton />
    </WorkspacePane>
  )
}
