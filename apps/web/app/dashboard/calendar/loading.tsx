import { WorkspacePane } from "@/components/layout/workspace-pane"
import { CalendarSkeleton } from "@/features/calendar/components/calendar-skeleton"

/**
 * Route-level skeleton for `/dashboard/calendar`. The actual placeholder
 * shape lives in `CalendarSkeleton` (header toolbar + week grid) so the
 * loader mirrors the real layout instead of the generic shell.
 */
export default function CalendarLoading() {
	return (
		<WorkspacePane>
			<CalendarSkeleton />
		</WorkspacePane>
	)
}
