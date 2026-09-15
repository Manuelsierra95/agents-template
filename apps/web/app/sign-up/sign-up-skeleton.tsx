/**
 * Skeleton for the new email/password/name sign-up form — three rows
 * (name + email + password), a one-line checkbox block, the submit, the
 * divider, and the Google button.
 */
export function SignUpSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="ml-2.5 h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-full animate-pulse rounded-[10px] bg-muted" />
        </div>
      ))}
      {/* Terms checkbox */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 size-4 animate-pulse rounded bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {/* Submit */}
      <div className="h-9 w-full animate-pulse rounded-full bg-muted" />
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/60" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {/* Google */}
      <div className="h-9 w-full animate-pulse rounded-[10px] bg-muted" />
    </div>
  )
}
