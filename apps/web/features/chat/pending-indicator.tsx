"use client"

import { ThinkingIndicator } from "@/features/chat/components"

/**
 * Minimalist "the agent is thinking" indicator. Wraps the fluid
 * `ThinkingIndicator` with no extra bubble chrome — no border, no fill,
 * no surface layer — so the indicator sits inline in the thread rather
 * than as its own card. Icon + cycling word only.
 *
 * Played at the end of the thread while the agent is mid-turn and no
 * text reply has arrived yet.
 */
export function PendingIndicator() {
	return (
		<div
			className="text-ink-3 flex justify-start px-1 py-2"
			data-pending
		>
			<ThinkingIndicator size="compact" />
		</div>
	)
}
