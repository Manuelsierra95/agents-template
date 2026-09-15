/**
 * Skeleton for the new email/password login form — three rows (label +
 * field) and two full-width blocks for the primary submit, the divider,
 * and the Google button.
 */
export function LoginSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4" aria-hidden>
      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <div className="ml-2.5 h-3 w-12 animate-pulse rounded bg-muted" />
        <div className="h-9 w-full animate-pulse rounded-[10px] bg-muted" />
      </div>
      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <div className="ml-2.5 h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-9 w-full animate-pulse rounded-[10px] bg-muted" />
      </div>
      {/* Forgot password */}
      <div className="flex justify-end">
        <div className="h-3 w-36 animate-pulse rounded bg-muted" />
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
