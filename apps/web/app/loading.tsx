export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas text-ink-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" />
        Cargando…
      </div>
    </div>
  )
}
