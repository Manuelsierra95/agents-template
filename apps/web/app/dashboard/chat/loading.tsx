import { WorkspacePane } from "@/components/layout/workspace-pane"
import { ChatSkeleton } from "@/features/chat/components/chat-skeleton"

/**
 * Route-level skeleton for `/dashboard/chat`. The actual placeholder
 * shapes live in `ChatSkeleton` so the layout (message list + composer)
 * is mirrored in one place and stays in lockstep with the rest of the
 * skeletons (shared `Skeleton` primitive).
 */
export default function Loading() {
	return (
		<WorkspacePane>
			<ChatSkeleton />
		</WorkspacePane>
	)
}