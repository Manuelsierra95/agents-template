import { Skeleton } from "@workspace/ui/components/skeleton"

/**
 * Route-level skeleton for `/dashboard/chat`. Mirrors the final layout
 * (message list + composer) so there is no layout shift when the
 * client component hydrates and starts owning the state.
 *
 * Uses the shared `Skeleton` primitive so animation, rounded corners,
 * and background tone stay in lockstep with the rest of the app.
 */
export function ChatSkeleton() {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				<Skeleton className="ml-auto h-9 w-48 rounded-2xl bg-muted/60" />
				<Skeleton className="h-9 w-64 rounded-2xl bg-muted/60" />
				<Skeleton className="ml-auto h-9 w-40 rounded-2xl bg-muted/60" />
			</div>
			<Skeleton className="h-12 rounded-xl bg-muted/60" />
		</div>
	)
}
