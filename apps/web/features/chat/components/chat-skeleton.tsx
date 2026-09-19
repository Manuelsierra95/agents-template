import { Skeleton } from "@workspace/ui/components/skeleton"

/**
 * Route-level skeleton for `/dashboard/chat`. Mirrors the final layout
 * (full-width scroll wrapper around a centred `max-w-7xl` thread
 * column, with the floating composer overlay capped at `max-w-3xl`)
 * so there is no layout shift when the client component hydrates and
 * starts owning the composer height.
 *
 * The scrollbar lives on the wrapper, not on the centred thread, so
 * it sits at the pane's right edge. The thread column reserves
 * `paddingBottom: COMPOSER_RESERVED_PX` (the static equivalent of the
 * real `inputH + 144` reservation: composer box ≈ 64 + 144 buffer)
 * so the messages don't slide under the floating composer.
 */
const COMPOSER_RESERVED_PX = 208

export function ChatSkeleton() {
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div
					className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-3 px-4 py-4 pl-8"
					style={{ paddingBottom: COMPOSER_RESERVED_PX }}
				>
					<Skeleton className="ml-auto h-9 w-56 rounded-2xl bg-muted/60" />
					<Skeleton className="h-9 w-44 rounded-2xl bg-muted/60" />
					<Skeleton className="ml-auto h-9 w-40 rounded-2xl bg-muted/60" />
				</div>
			</div>
			<div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
				<Skeleton className="h-12 w-full max-w-3xl rounded-xl bg-muted/60" />
			</div>
		</div>
	)
}
