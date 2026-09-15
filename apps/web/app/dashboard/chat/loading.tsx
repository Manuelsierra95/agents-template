import { WorkspacePane } from "@/components/layout/workspace-pane"

/**
 * Route-level skeleton for `/dashboard/chat`. Mirrors the final layout
 * (message list + composer) so there is no layout shift when the
 * client component hydrates and starts owning the state.
 */
export default function Loading() {
	return (
		<WorkspacePane>
			<div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
				<div className="flex min-h-0 flex-1 flex-col gap-3">
					<div className="ml-auto h-9 w-48 animate-pulse rounded-2xl bg-muted/60" />
					<div className="h-9 w-64 animate-pulse rounded-2xl bg-muted/60" />
					<div className="ml-auto h-9 w-40 animate-pulse rounded-2xl bg-muted/60" />
				</div>
				<div className="h-12 animate-pulse rounded-xl bg-muted/60" />
			</div>
		</WorkspacePane>
	)
}