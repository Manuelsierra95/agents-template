import { LoginSkeleton } from "@/app/login/login-skeleton"

export default function Loading() {
  return (
    <main className="grid min-h-dvh bg-canvas md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel mirror — matches the server-rendered panel's geometry
          with pulse blocks so the layout doesn't reflow when the page hydrates. */}
      <aside
        aria-hidden
        className="hidden flex-col justify-between gap-10 bg-canvas p-12 md:flex lg:p-16"
      >
        <div className="flex flex-col gap-10">
          <div className="flex items-center gap-2.5">
            <div className="size-9 animate-pulse rounded-[10px] bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-3 p-4 shadow-surface-2">
            <div className="aspect-[16/9] w-full animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-56 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="size-4 animate-pulse rounded bg-muted" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </aside>

      <section className="flex items-center justify-center px-6 py-12 md:px-10 md:py-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-56 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </header>
          <LoginSkeleton />
          <div className="mx-auto h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
      </section>
    </main>
  )
}
