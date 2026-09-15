export default function Loading() {
  return (
    <div className="flex items-center gap-3 p-10 text-sm text-ink-3">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink" />
      Cargando…
    </div>
  )
}
