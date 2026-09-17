import { Skeleton } from "@workspace/ui/components/skeleton"

import { VIEW_COLUMNS } from "./lib"

/**
 * Route-level skeleton for `/dashboard/calendar`. Mirrors the final
 * layout (pager toolbar on top, scrollable body with sticky time
 * gutter + day-column strip) so the page morphs straight to its final
 * size and the streamed children fade in without a second height
 * change.
 *
 * Bar colour is `bg-foreground/10` instead of the Skeleton primitive
 * default `bg-muted` because every surface this skeleton sits on
 * (`bg-calendar-header` for the toolbar, `bg-background` for the
 * body) is near-white in light mode — `bg-muted` would be invisible.
 * Column count comes from `VIEW_COLUMNS.week` so it cannot drift from
 * the real week view.
 */

const COLUMNS = VIEW_COLUMNS.week
const BAR = "bg-foreground/10"

export function CalendarSkeleton() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Toolbar — mirrors the real <header> (title + week badge on
			 * the left, segmented view switcher + Today + nav arrows +
			 * calendar picker + bell on the right). */}
			<div className="flex items-center justify-between gap-4 border-t border-border/80 bg-calendar-header px-4 py-2.5">
				<div className="flex items-center gap-2">
					<Skeleton className={`h-4 w-32 rounded-md ${BAR}`} />
					<Skeleton className={`h-5 w-10 rounded-md ${BAR}`} />
				</div>
				<div className="flex items-center gap-3">
					<Skeleton className={`h-7 w-32 rounded-lg ${BAR}`} />
					<Skeleton className={`h-7 w-14 rounded-md ${BAR}`} />
					<Skeleton className={`size-7 rounded-md ${BAR}`} />
					<Skeleton className={`size-7 rounded-md ${BAR}`} />
					<Skeleton className={`h-7 w-28 rounded-md ${BAR}`} />
					<Skeleton className={`size-8 rounded-full ${BAR}`} />
				</div>
			</div>

			{/* Body — mirrors the TimeStrip container: sticky left gutter
			 * (time labels) on top of a 7-column strip. Each day cell has
			 * a header row plus 2–3 event blocks of varying heights so the
			 * column measures close to its real shape. */}
			<div className="flex min-h-0 flex-1 overflow-auto scrollbar-hide">
				<div className="sticky left-0 z-30 flex w-14 shrink-0 flex-col gap-3 bg-background p-2">
					<Skeleton className={`h-7 w-full rounded-md ${BAR}`} />
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton
							key={i}
							className={`h-3 w-8 rounded-md ${BAR}`}
						/>
					))}
				</div>
				<div className="grid min-w-0 flex-1 grid-cols-7">
					{Array.from({ length: COLUMNS }).map((_, i) => (
						<div
							key={i}
							className="flex min-w-0 flex-col gap-2 border-l border-border/60 p-2 first:border-l-0"
						>
							<Skeleton className={`h-7 w-full rounded-md ${BAR}`} />
							<Skeleton className={`h-14 w-full rounded-md ${BAR}`} />
							<Skeleton className={`h-10 w-full rounded-md ${BAR}`} />
							<Skeleton className={`h-20 w-full rounded-md ${BAR}`} />
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
