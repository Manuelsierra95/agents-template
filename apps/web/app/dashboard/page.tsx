import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Placeholder dashboard route — lives inside the auth-gated sidebar layout
 * so the chrome (rail + inset trigger + peek affordance) is visible while
 * the real dashboard builds out. Renders into the inset's plain background
 * to show the rounded card and the workspace's relationship to the rail.
 */
export default function DashboardPage() {
  return (
    <WorkspacePane>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
            Dashboard
          </p>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            Welcome back
          </h1>
          <p className="text-[13px] text-ink-2">
            Pick a section from the sidebar to get started.
          </p>
        </header>
      </div>
    </WorkspacePane>
  )
}
