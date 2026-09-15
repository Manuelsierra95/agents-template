/**
 * Chat entry types shared by every chat surface (playground, operator
 * conversation, future). Each feature adapts its wire types to these so
 * `ChatThread` only needs to know one shape.
 *
 * Notes:
 *  - `id` is opaque and stable for the lifetime of the entry; required by
 *    the renderer to drive React keys.
 *  - `createdAt` is always an epoch number — callers convert from strings
 *    (ISO, conversations API) when they cross the boundary.
 *  - `tool` carries everything needed to render a tool card without the
 *    renderer needing feature-specific knowledge: tool name, raw input,
 *    synthetic output, status, optional error message.
 *  - `reasoning` keeps the accumulated chain-of-thought and a `finalized`
 *    flag so the UI can keep the panel open while streaming and collapse
 *    it once the model is done (mirrors the fluid ThinkingSteps
 *    `defaultOpen` behaviour).
 */

export type EntryId = string

export type UserEntry = {
	id: EntryId
	kind: "user"
	content: string
	createdAt: number
}

export type AgentEntry = {
	id: EntryId
	kind: "agent"
	content: string
	createdAt: number
	/**
	 * Final-assistant-text marker. When `true` the bubble is the END of
	 * the current turn (a `message.completed` with `finishReason: stop`),
	 * not interim narration between tool calls.
	 */
	turnId?: string
}

export type SystemEntry = {
	id: EntryId
	kind: "system"
	content: string
	createdAt: number
}

export type ToolStatus = "running" | "completed" | "failed"

export type ToolEntry = {
	id: EntryId
	kind: "tool"
	tool: string
	input: Record<string, unknown>
	simulatedOutput: Record<string, unknown> | null
	callId?: string
	createdAt: number
	status: ToolStatus
	errorMessage?: string
}

/**
 * Status of an individual step inside a multi-step reasoning block.
 * Mirrors the `StepStatus` exported by `@workspace/ui/components/thinking-steps`:
 *   - `complete` → step finished, rendered as the normal collapsed row.
 *   - `active`   → step is the one currently in progress; rendered with
 *                  the active indicator and expanded children.
 *   - `pending`  → step has not started; the underlying `ThinkingStep`
 *                  returns `null` and reserves no vertical space, letting
 *                  the block grow step-by-step as the agent streams.
 */
export type ReasoningStepStatus = "complete" | "active" | "pending"

/**
 * Optional inline image child for a reasoning step. Mirrors the props
 * accepted by `ThinkingStepImage`.
 */
export type ReasoningStepImage = {
	src: string
	alt?: string
	caption?: string
}

/**
 * Optional nested-collapsible child for a reasoning step.
 */
export type ReasoningStepDetails = {
	summary?: string
	items?: string[]
}

/**
 * Single step inside a multi-step reasoning block. Drives the rendering
 * of one `<ThinkingStep>` — including its leading icon, label, optional
 * description, status, and inline children (sources / details / image).
 */
export type ReasoningStep = {
	icon: string
	label: string
	description?: string
	status: ReasoningStepStatus
	sources?: string[]
	details?: ReasoningStepDetails
	image?: ReasoningStepImage
}

export type ReasoningEntry = {
	id: EntryId
	kind: "reasoning"
	content: string
	createdAt: number
	finalized: boolean
	about?: string
	/**
	 * Optional multi-step representation. When present, the renderer
	 * expands the entry into a full `ThinkingSteps` block with one
	 * `<ThinkingStep>` per entry (icon / label / sources / details /
	 * image) and uses each step's `status` directly. When absent, the
	 * renderer falls back to a single-step block derived from
	 * `content` + `about`.
	 */
	steps?: ReasoningStep[]
}

export type ChatEntry =
	| UserEntry
	| AgentEntry
	| SystemEntry
	| ToolEntry
	| ReasoningEntry

/** Visual sender the renderer uses to pick a side / accent. */
export type SenderSide = "user" | "assistant" | "system"

export function entrySide(entry: ChatEntry): SenderSide {
	if (entry.kind === "user") return "user"
	if (entry.kind === "agent") return "assistant"
	if (entry.kind === "system") return "system"
	// Tool / reasoning cards are rendered as their own blocks, not as
	// bubbles; the helper returns "assistant" only as a defensive default.
	return "assistant"
}

/** hh:mm clock label. Falls back to "—" for invalid timestamps. */
export function clockLabel(timestamp: number): string {
	if (!Number.isFinite(timestamp)) return "—"
	const date = new Date(timestamp)
	const hh = String(date.getHours()).padStart(2, "0")
	const mm = String(date.getMinutes()).padStart(2, "0")
	return `${hh}:${mm}`
}

/** Long Spanish date+time label, matching the conversation-detail header. */
export function longDateTimeLabel(timestamp: number): string {
	if (!Number.isFinite(timestamp)) return "—"
	return new Date(timestamp).toLocaleString("es-ES", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}
