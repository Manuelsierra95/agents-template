"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { ChatThread, InputMessage, type ChatEntry } from "@/features/chat"
import type { ReasoningStep } from "@/features/chat/utils/types"
import { Button, Tooltip, useIcon } from "@workspace/ui/components/sidebar"

// px from the bottom below which we treat the user as "following" the
// stream. Above this distance the auto-scroll gives up and the user
// keeps their position.
const FOLLOW_THRESHOLD = 96

// ms we wait for the smooth scroll triggered by `handleSend` to settle
// before re-engaging follow mode. Long enough for the animation on
// slow devices, short enough that the user perceives "my message first,
// then the answer".
const SCROLL_SETTLE_MS = 500

type ScrollMode = "manual" | "follow"

/**
 * Stateful chat shell for `/dashboard/chat`.
 *
 * Layout: a flex column with `ChatThread` filling the scroll viewport and
 * the `InputMessage` floated absolutely over the bottom edge. Composer
 * geometry (height, bottom offset, fade zone) lives in three CSS variables
 * on the relative wrapper, observed via `ResizeObserver` — every consumer
 * (thread padding, fade mask, pill bottom) reads from them via `calc()`.
 *
 * Scroll behaviour is a tiny state machine (`manual` | `follow`):
 *   - On send, `handleSend` flips the mode to `manual`, smooth-scrolls the
 *     new user message near the top, waits `SCROLL_SETTLE_MS` for the
 *     animation to settle, then re-engages `follow` so the streaming
 *     reasoning steps can pull the thread to the bottom.
 *   - The auto-scroll effect only fires in `follow` mode, so the user's
 *     scroll-up position is never overridden mid-stream.
 *   - When the user scrolls more than `FOLLOW_THRESHOLD` px above the
 *     bottom, the mode flips to `manual` and a "↓ N mensajes nuevos"
 *     pill appears above the composer. Clicking it `scrollToBottom`s the
 *     thread and re-engages `follow`.
 *
 * `InputMessage` ships with everything this route needs (suggestions list,
 * placeholder ghost, Tab-fill, ArrowUp/Down history walk, drag-and-drop
 * attachments, `leftSlot` callback for an attach button, `openFilePicker`,
 * `Send → Stop` morph via `status`/`onStop`). The bare snippet from the
 * fluid docs works literally on top of it.
 *
 * The agent reply is still a scripted local simulation — entry sequence,
 * reasoning steps, sources, image, details, system pill and the agent
 * bubble fire on timers after each user submit. Attachments are accepted
 * by the composer but not yet forwarded into the simulation.
 *
 * Sequence (all timestamps are relative to the user submit):
 *   t = 0.0s   user entry                  → user bubble appears
 *   t = 0.0s   pending = true              → flips composer into Stop
 *   t = 0.0s   scrollMode = manual         → scroll-to-message starts
 *   t ≈ 0.5s   scrollToMessage settled     → scrollMode = follow re-engages
 *   t = 1.5s   reasoning step 2 active     → sources appear (auto-scroll)
 *   t = 3.0s   reasoning step 3 active     → image appears (auto-scroll)
 *   t = 4.5s   reasoning step 4 active     → details collapse opens (auto-scroll)
 *   t = 6.0s   reasoning step 5 active     → final step (auto-scroll)
 *   t = 7.0s   reasoning finalized         → ThinkingSteps auto-collapses
 *   t = 8.0s   system pill                 → centred status banner (auto-scroll)
 *  t = 10.0s   agent reply + pending=false → assistant bubble, composer idle
 *
 * No trailing `PendingIndicator` is rendered: the active step inside the
 * reasoning block carries the live progress, so a separate "thinking…"
 * pill would be redundant.
 */

const SUGGESTIONS = [
  "What is Fluid Functionalism about?",
  "How does Micka tune the springs behind these animations?",
  "Install the InputMessage component in my project",
  "Draft a short thank-you note to Micka for the library",
]

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
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const timersRef = useRef<number[]>([])

  // Float the composer over the transcript: measure it to expose three
  // CSS variables (`--composer-height`, `--composer-offset`,
  // `--composer-fade`) on the outer relative wrapper. Every consumer
  // (ChatThread padding, fade mask, pill bottom) reads from them via
  // `calc()` — no magic numbers scattered across expressions.
  // `useLayoutEffect` runs synchronously before paint, so the initial
  // measurement is in place on the very first frame (no flash with
  // stale padding) and any size change (textarea growth, attached
  // files row, queue, …) updates the vars before the user can see
  // the mismatch.
  const composerRef = useRef<HTMLDivElement>(null)
  const [inputH, setInputH] = useState(0)
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setInputH(el.offsetHeight))
    ro.observe(el)
    setInputH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // Single source of truth for composer geometry. `--composer-height`
  // is rewritten by the observer above; the other two are static
  // layout constants. `--composer-fade` doubles as the bottom
  // breathing room reserved in the thread's `paddingBottom`, so
  // the last message never sits under the composer overlay.
  const composerVars = {
    "--composer-height": `${inputH}px`,
    "--composer-offset": "1rem", // distance from viewport bottom to composer
    "--composer-fade": "6rem", // breathing room above the composer
  } as CSSProperties

  // ─── Scroll state machine ────────────────────────────────────────────
  // The thread's scrollbar lives on this wrapper (full pane width) so it
  // sits at the right edge of the page rather than at the right edge of
  // the centred `max-w-7xl` thread column. `mode` gates the auto-scroll
  // effect below: only in `follow` does a new entry pull the thread to
  // the bottom. `manual` preserves the user's reading position and is
  // paired with a "↓ N mensajes nuevos" pill.
  //
  // We pair `mode` with `baseline` (entries.length at the moment we
  // last entered `follow`) in a single state slot so the transition
  // follow → manual snapshots both in one update — no effect, no
  // refs-during-render, no cascading renders.
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({
    mode: "follow" as ScrollMode,
    baseline: 0,
  })
  const { mode: scrollMode, baseline: scrollBaseline } = scrollState

  const scrollToMessage = useCallback((entryId: string) => {
    const wrapper = threadScrollRef.current
    if (!wrapper) return
    const target = wrapper.querySelector<HTMLElement>(
      `[data-entry-id="${entryId}"]`
    )
    if (!target) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    // Park the target 16 px below the viewport top.
    const offset = targetRect.top - wrapperRect.top - 16
    wrapper.scrollTo({
      top: wrapper.scrollTop + offset,
      behavior: "smooth",
    })
  }, [])

  const scrollToBottom = useCallback(() => {
    const wrapper = threadScrollRef.current
    if (!wrapper) return
    wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: "smooth" })
  }, [])

  const handleThreadScroll = useCallback(() => {
    const el = threadScrollRef.current
    if (!el) return
    const distFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight
    const nextMode = distFromBottom < FOLLOW_THRESHOLD ? "follow" : "manual"
    setScrollState((prev) =>
      nextMode === "manual" && prev.mode === "follow"
        ? { mode: nextMode, baseline: entries.length }
        : { ...prev, mode: nextMode }
    )
  }, [entries])

  // Mirror the latest scrollMode into a ref so the auto-scroll effect
  // below can read it without listing it as a dep. Listing it would
  // re-fire the effect on every follow↔manual transition, which would
  // yank the thread back to the bottom the moment `handleSend` re-
  // engages follow (500 ms after scroll-to-message) and overwrite the
  // user's parked-at-top position. With the ref the effect only fires
  // on actual entry mutations — exactly what we want.
  const scrollModeRef = useRef(scrollMode)
  useEffect(() => {
    scrollModeRef.current = scrollMode
  })

  // Auto-scroll on entry mutations ONLY. Gated by `scrollModeRef`
  // (latest) so a manual scroll-up isn't yanked back to the bottom
  // mid-stream.
  useEffect(() => {
    if (scrollModeRef.current !== "follow") return
    const el = threadScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight })
  }, [entries])

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
    patch: (steps: ReasoningStep[]) => ReasoningStep[]
  ) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id && e.kind === "reasoning"
          ? { ...e, steps: patch(e.steps ?? []) }
          : e
      )
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
      })
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
          : e
      )
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
    // Drop into manual so the auto-scroll effect can't yank the thread
    // away from the message we're about to park at the top. Snapshot
    // the new entries length into `baseline` so the pill counter is
    // well-defined when (if) the user scrolls up later.
    setScrollState({ mode: "manual", baseline: entries.length + 2 })
    // One rAF so React commits the new <li data-entry-id="..."> into
    // the DOM before we query for it. Then smooth-scroll to it and
    // re-engage follow once the animation has settled — the next
    // streaming patch will then pull the thread to the bottom.
    requestAnimationFrame(() => {
      scrollToMessage(userEntry.id)
      setTimeout(() => {
        setScrollState((prev) => ({ ...prev, mode: "follow" }))
      }, SCROLL_SETTLE_MS)
    })

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

  function handleStop() {
    clearTimers()
    setPending(false)
  }

  const PlusIcon = useIcon("plus")

  // ArrowUp recalls sent messages, ArrowDown walks back to the draft.
  const history = entries
    .filter((e): e is Extract<ChatEntry, { kind: "user" }> => e.kind === "user")
    .map((e) => e.content)
    .filter(Boolean)

  // Once the user has sent at least one message the thread is "started":
  // suggestions and `placeholderSuggestion` are onboarding affordances and
  // must not return on subsequent sends, and the composer + bubbles step
  // down to the compact size ladder so the live conversation reads denser.
  const hasStarted = entries.length > 0

  // Messages that arrived while the user is reading above the bottom.
  // Hidden in `follow`; surfaced as a pill in `manual`.
  const pendingBelowCount =
    scrollMode === "manual"
      ? Math.max(0, entries.length - scrollBaseline)
      : 0

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      style={composerVars}
    >
      <div
        ref={threadScrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={handleThreadScroll}
        style={{
          maskImage:
            "linear-gradient(to bottom, black calc(100% - var(--composer-height) - var(--composer-offset) - var(--composer-fade)), transparent calc(100% - var(--composer-height) - var(--composer-offset)))",
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - var(--composer-height) - var(--composer-offset) - var(--composer-fade)), transparent calc(100% - var(--composer-height) - var(--composer-offset)))",
        }}
      >
        <ChatThread
          className="mx-auto w-full max-w-5xl"
          entries={entries}
          compact={hasStarted}
          scroll={false}
          style={{
            paddingBottom:
              "calc(var(--composer-height) + var(--composer-offset) + var(--composer-fade))",
          }}
        />
      </div>
      {pendingBelowCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            scrollToBottom()
            setScrollState((prev) => ({ ...prev, mode: "follow" }))
          }}
          style={{
            bottom: "calc(var(--composer-offset) + var(--composer-height) + 12px)",
          }}
          className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line/40 bg-canvas/90 px-3 py-1.5 text-xs font-medium text-ink-2 shadow-md backdrop-blur-sm transition hover:bg-canvas"
        >
          <span aria-hidden="true" className="-mt-px text-sm leading-none">
            ↓
          </span>
          {pendingBelowCount}{" "}
          {pendingBelowCount === 1 ? "mensaje nuevo" : "mensajes nuevos"}
        </button>
      ) : null}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-4"
        style={{ bottom: "var(--composer-offset)" }}
      >
        <InputMessage
          ref={composerRef}
          className="pointer-events-auto w-full max-w-3xl bg-secondary"
          size={hasStarted ? "compact" : undefined}
          value={draft}
          onValueChange={setDraft}
          onSend={(text) => {
            setFiles([])
            handleSend(text)
          }}
          onStop={handleStop}
          status={pending ? "streaming" : "idle"}
          placeholderSuggestion={
            hasStarted ? undefined : "Why is every other input box so stiff?"
          }
          suggestions={hasStarted ? undefined : SUGGESTIONS}
          history={history}
          files={files}
          onFilesChange={setFiles}
          clickToFocus
          sendLabel="Enviar"
          data-testid="chat-composer-input"
          leftSlot={({ openFilePicker }) => (
            <Tooltip content="Adjuntar" side="top">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Adjuntar archivos"
                onClick={() => openFilePicker()}
              >
                <PlusIcon />
              </Button>
            </Tooltip>
          )}
        />
      </div>
    </div>
  )
}
