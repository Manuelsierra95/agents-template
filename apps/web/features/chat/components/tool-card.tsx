"use client"

import {
	projectToolInput,
	projectToolOutputSummary,
} from "@/features/chat/utils/project-tool"
import type { ToolEntry } from "@/features/chat/utils/types"

const STATUS_LABEL: Record<ToolEntry["status"], string> = {
	running: "ejecutando…",
	completed: "simulado",
	failed: "error simulado",
}

/**
 * Renders one tool execution with the most relevant input args surfaced
 * as a one-line-per-arg summary. The green "✓ Simulado" banner is the
 * visual contract for any sandbox surface — it tells the reader nothing
 * actually happened.
 *
 * Layout: tool name + status pill → input projection → result summary
 * → simulated banner.
 *
 * The outer element is a `<div>` (NOT a `<li>`) on purpose: the chat
 * thread renders this inside an `<ol>`, and any future caller might
 * wrap it in another `<li>` for layout reasons. Nesting `<li>` inside
 * `<li>` is invalid HTML and breaks hydration. A `<div>` is safe in
 * either context; the `data-tool` attribute is what tests/assertions
 * key on, not the tag.
 */
export function ToolCard({
	entry,
	mode = "client",
}: {
	entry: ToolEntry
	/**
	 * Display mode forwarded by the caller. Debug widens the card and
	 * pins it to the left edge so the layout matches the rest of the
	 * thread (which is left-anchored, not centred).
	 */
	mode?: "client" | "debug"
}) {
	const projectedInput = projectToolInput(entry.tool, entry.input)
	const projectedOutput = projectToolOutputSummary(entry.tool, entry.simulatedOutput)
	const statusTone =
		entry.status === "running"
			? "border-amber-300 bg-amber-50 text-amber-800"
			: entry.status === "failed"
				? "border-red-300 bg-red-50 text-red-800"
				: "border-emerald-300 bg-emerald-50 text-emerald-800"

	return (
		<div
			className={
				mode === "debug"
					? "border-line/60 w-full max-w-5xl rounded-[12px] border bg-canvas/40 p-3"
					: "border-line/60 mx-auto w-full max-w-[560px] rounded-[12px] border bg-canvas/40 p-3"
			}
			data-tool={entry.tool}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="text-ink font-mono text-[12px] font-semibold">
					{entry.tool}
				</span>
				<span
					className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide ${statusTone}`}
				>
					{STATUS_LABEL[entry.status]}
				</span>
			</div>
			{projectedInput.length > 0 ? (
				<dl className="text-ink-2 mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12px]">
					{projectedInput.map((field) => (
						<div key={field.label} className="contents">
							<dt className="text-ink-3 font-mono text-[10.5px] uppercase">
								{field.label}
							</dt>
							<dd className="text-ink break-words">{field.value}</dd>
						</div>
					))}
				</dl>
			) : null}
			<p className="text-ink-2 mt-2 text-[12.5px]">
				<span className="text-ink-3 font-mono text-[10.5px] uppercase">
					Resultado
				</span>
				<br />
				{projectedOutput}
			</p>
			<p className="text-ink-3 mt-2 font-mono text-[10.5px] tracking-wide uppercase">
				✓ Simulado — ningún dato fue creado
			</p>
		</div>
	)
}
