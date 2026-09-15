import { WorkspacePane } from "@/components/layout/workspace-pane"
import { ChatPanel } from "./_components/chat-panel"

/**
 * Auth-gated chat surface. The redirect logic lives in
 * `app/dashboard/layout.tsx`; this page only renders the chat shell
 * inside the workspace pane.
 *
 * `instant = false` opts the route out of the static-shell validation
 * pass for the same reason as the other dashboard siblings — the
 * parent layout redirects on missing sessions, so the static shell
 * can't be validated here.
 */
export const instant = false

export default function ChatPage() {
	return (
		<WorkspacePane>
			<ChatPanel />
		</WorkspacePane>
	)
}