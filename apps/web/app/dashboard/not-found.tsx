import Link from "next/link"
import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Not found UI for the authenticated `/dashboard/*` tree. Reached by Next's
 * `notFound()` from any descendant page (e.g. `app/dashboard/agents/[id]/page.tsx`).
 *
 * Lives inside the workspace pane so the sidebar stays mounted.
 */
export default function AppNotFound() {
  return (
    <WorkspacePane>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center">
        <p className="text-ink-3 font-mono text-[11px] tracking-wide uppercase">
          404
        </p>
        <h1 className="text-ink text-[22px] font-semibold tracking-[-0.01em]">
          Page not found
        </h1>
        <p className="text-ink-2 max-w-sm text-[13px]">
          The page you are looking for does not exist or you do not have access.
        </p>
        <Link
          href="/dashboard"
          className="rounded-10 text-surface bg-accent px-3 py-1.5 text-[12.5px] font-medium transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98]"
        >
          Go to dashboard
        </Link>
      </div>
    </WorkspacePane>
  )
}
