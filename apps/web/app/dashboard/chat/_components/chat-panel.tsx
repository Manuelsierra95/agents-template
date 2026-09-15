"use client"

import { useRef, useState } from "react"
import {
	ChatThread,
	ChatComposer,
	type ChatEntry,
	type ReasoningStep,
} from "@/features/chat"

/**
 * Stateful chat shell for `/dashboard/chat`.
 *
 * Orchestrates the existing feature primitives — `ChatThread` for the
 * message list and `ChatComposer` for the textarea — and replays a
 * scripted agent turn locally so every visible chat surface is
 * exercised after the user sends a single message.
 *
 * Why a scripted sequence: the chat feature exposes several entry
 * kinds (`user`, `reasoning`, `system`, `agent`) plus a
 * `PendingIndicator` and the full `ThinkingSteps` API (steps,
 * sources, details, image). A real wire would stream each piece
 * from the model. Until that lands, this mock replays the full
 * sequence on a timer so the renderer has something to draw that
 * matches the operator / playground expectations.
 *
 * Sequence (all timestamps are relative to the user submit):
 *   t = 0.0s   user entry                  → user bubble appears
 *   t = 0.0s   pending = true              → flips composer into Stop
 *   t = 0.2s   reasoning step 1 active     → ThinkingSteps opens, step 1 streams
 *   t = 1.5s   reasoning step 2 active     → sources appear
 *   t = 3.0s   reasoning step 3 active     → image appears
 *   t = 4.5s   reasoning step 4 active     → details collapse opens
 *   t = 6.0s   reasoning step 5 active     → final step
 *   t = 7.0s   reasoning finalized         → ThinkingSteps auto-collapses
 *   t = 8.0s   system pill                 → centred status banner
 *  t = 10.0s   agent reply + pending=false → assistant bubble, composer idle
 *
 * No trailing `PendingIndicator` is rendered: the active step inside the
 * reasoning block carries the live progress, so a separate "thinking…"
 * pill would be redundant.
 */

const SCRIPTED_REPLY =
	"Listo — he simulado el flujo completo del agente. Encima puedes ver los pasos de razonamiento, las fuentes consultadas, el contexto visual y el plan propuesto."

const SIMULATED_AVATAR_SVG =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%23e2e8f0'/><stop offset='100%25' stop-color='%23cbd5e1'/></linearGradient></defs><rect width='200' height='120' fill='url(%23g)'/><circle cx='100' cy='48' r='18' fill='%2394a3b8'/><rect x='62' y='78' width='76' height='24' rx='12' fill='%2394a3b8'/><text x='100' y='112' text-anchor='middle' font-family='sans-serif' font-size='9' fill='%2364748b'>avatar simulado</text></svg>"

const REASONING_TEMPLATE: ReasoningStep[] = [
	{
		icon: "search",
		label: "Interpretando la consulta",
		description: "Detectando intención, entidades y datos relevantes.",
		status: "pending",
	},
	{
		icon: "users",
		label: "Buscando historial del cliente",
		description: "Cruzando conversaciones y reservas previas.",
		status: "pending",
		sources: ["CRM", "WhatsApp", "Email"],
	},
	{
		icon: "image",
		label: "Identificando contexto visual",
		description: "Avatar detectado en la conversación anterior.",
		status: "pending",
		image: {
			src: SIMULATED_AVATAR_SVG,
			alt: "Avatar simulado del cliente",
			caption: "Avatar detectado en la última conversación",
		},
	},
	{
		icon: "brain",
		label: "Generando plan de respuesta",
		description: "Definiendo los pasos a ejecutar antes de contestar.",
		status: "pending",
		details: {
			summary: "Plan propuesto",
			items: [
				"Confirmar identidad del cliente",
				"Recuperar disponibilidad del staff",
				"Reservar hueco en el calendario",
				"Redactar confirmación",
			],
		},
	},
	{
		icon: "check",
		label: "Listo para responder",
		description: "Plan validado, encolando la respuesta al usuario.",
		status: "pending",
	},
]

let entrySeq = 0
function makeId(prefix: string): string {
	entrySeq += 1
	return `${prefix}-${Date.now()}-${entrySeq}`
}

export function ChatPanel() {
	const [entries, setEntries] = useState<ChatEntry[]>([])
	const [draft, setDraft] = useState("")
	const [pending, setPending] = useState(false)
	const timersRef = useRef<number[]>([])

	function clearTimers() {
		for (const id of timersRef.current) window.clearTimeout(id)
		timersRef.current = []
	}

	function schedule(delayMs: number, fn: () => void) {
		const id = window.setTimeout(fn, delayMs)
		timersRef.current.push(id)
	}

	function patchReasoningSteps(
		id: string,
		patch: (steps: ReasoningStep[]) => ReasoningStep[],
	) {
		setEntries((prev) =>
			prev.map((e) =>
				e.id === id && e.kind === "reasoning"
					? { ...e, steps: patch(e.steps ?? []) }
					: e,
			),
		)
	}

	function advanceReasoning(id: string, upToActive: number) {
		patchReasoningSteps(id, (steps) =>
			steps.map((step, index) => {
				if (index < upToActive) {
					return { ...step, status: "complete" }
				}
				if (index === upToActive) {
					return { ...step, status: "active" }
				}
				return { ...step, status: "pending" }
			}),
		)
	}

	function finalizeReasoning(id: string) {
		setEntries((prev) =>
			prev.map((e) =>
				e.id === id && e.kind === "reasoning"
					? {
							...e,
							finalized: true,
							steps: (e.steps ?? []).map((step) => ({
								...step,
								status: "complete",
							})),
						}
					: e,
			),
		)
	}

	function handleSend(text: string) {
		clearTimers()

		const now = Date.now()
		const userEntry: ChatEntry = {
			id: makeId("user"),
			kind: "user",
			content: text,
			createdAt: now,
		}
		const reasoningId = makeId("reasoning")
		const reasoningEntry: ChatEntry = {
			id: reasoningId,
			kind: "reasoning",
			content: "Iniciando razonamiento…",
			createdAt: now + 1,
			finalized: false,
			about: text,
			steps: REASONING_TEMPLATE.map((step, index) => ({
				...step,
				status: index === 0 ? "active" : "pending",
			})),
		}

		setEntries((prev) => [...prev, userEntry, reasoningEntry])
		setDraft("")
		setPending(true)

		schedule(1500, () => advanceReasoning(reasoningId, 1))
		schedule(3000, () => advanceReasoning(reasoningId, 2))
		schedule(4500, () => advanceReasoning(reasoningId, 3))
		schedule(6000, () => advanceReasoning(reasoningId, 4))
		schedule(7000, () => finalizeReasoning(reasoningId))

		schedule(8000, () => {
			const systemEntry: ChatEntry = {
				id: makeId("system"),
				kind: "system",
				content: "Razonamiento completo · plan validado",
				createdAt: Date.now(),
			}
			setEntries((prev) => [...prev, systemEntry])
		})

		schedule(10000, () => {
			const agentEntry: ChatEntry = {
				id: makeId("agent"),
				kind: "agent",
				content: SCRIPTED_REPLY,
				createdAt: Date.now(),
				turnId: "turn_sim_001",
			}
			setEntries((prev) => [...prev, agentEntry])
			setPending(false)
		})
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ChatThread entries={entries} />
			<ChatComposer
				value={draft}
				onValueChange={setDraft}
				onSend={handleSend}
				pending={pending}
				placeholder="Escribe cualquier cosa — verás el ciclo completo del chat"
			/>
		</div>
	)
}