"use client"

import Link from "next/link"
import { useEffect } from "react"
import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Error boundary for the authenticated `/dashboard/*` tree. The auth layout
 * already wrapped the page in `<AppShell>`, so this catches errors from
 * any descendant page while keeping the chrome rendered.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app/*] route error:", error)
  }, [error])

  return (
    <WorkspacePane>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center">
        <h1 className="text-ink text-[22px] font-semibold tracking-[-0.01em]">
          Something went wrong
        </h1>
        <p className="text-ink-2 max-w-sm text-[13px]">
          We could not load this page. Please try again.
        </p>
        {error.digest ? (
          <p className="text-ink-3 font-mono text-[11px]">{error.digest}</p>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-10 text-surface bg-accent px-3 py-1.5 text-[12.5px] font-medium transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98]"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="text-[12.5px] font-medium text-accent hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </WorkspacePane>
  )
}
