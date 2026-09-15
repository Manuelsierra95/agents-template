"use client"

/**
 * Root error boundary.
 *
 * Catches render / fetch errors that escape from the public landing
 * page (`/`) and its children. The sidebar-style chrome is not present
 * here — this is the marketing / sign-in funnel.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Something went wrong
        </h1>
        <p className="text-[13px] text-ink-2">
          We could not load this page. Please try again.
        </p>
        {error.digest ? (
          <p className="font-mono text-[11px] text-ink-3">{error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="rounded-10 bg-accent px-3 py-1.5 text-[12.5px] font-medium text-surface transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </main>
  )
}