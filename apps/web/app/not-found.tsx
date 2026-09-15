import Link from "next/link"

/**
 * Root `not-found.tsx` — rendered for any URL that does not resolve to
 * a route and is not handled by a more specific `not-found.tsx`.
 *
 * Lives at the document root (no app shell, no sidebar). Reached by
 * Next's `notFound()` from any page that returns 404.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
          404
        </p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Page not found
        </h1>
        <p className="text-[13px] text-ink-2">
          The URL you followed does not match any route in this app.
        </p>
        <Link
          href="/"
          className="rounded-10 bg-accent px-3 py-1.5 text-[12.5px] font-medium text-surface transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.98]"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}