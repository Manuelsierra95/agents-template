/**
 * Maps a `ReasoningEntry` to the props the fluid `ThinkingSteps`
 * components need. Kept as a pure function so multiple chat surfaces
 * can render the same chain-of-thought without duplicating the
 * accumulator→step transformation.
 *
 * The mapping is deliberately simple: a single reasoning block becomes
 * a single `ThinkingStep` with the accumulated content as its
 * `description`. Future surfaces that surface per-event steps can
 * extend `ProjectReasoning` to carry a richer step list without
 * touching the renderer.
 */

import type { ReasoningEntry } from "@/features/chat/utils/types"

export type ProjectedReasoning = {
	label: string
	description: string
	finalized: boolean
}

export function projectReasoning(
	entry: ReasoningEntry,
): ProjectedReasoning {
	const description = entry.content || "(sin contenido)"
	return {
		label: entry.about ? `Pensando en ${entry.about}` : "Pensando…",
		description,
		finalized: entry.finalized,
	}
}
