"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import {
  ChatMessage,
  ThinkingSteps,
  ThinkingStepsHeader,
  ThinkingStepsContent,
  ThinkingStep,
  ThinkingStepDetails,
  ThinkingStepSource,
  ThinkingStepSources,
  ThinkingStepImage,
} from "@/features/chat/components"
import { clockLabel, entrySide, longDateTimeLabel } from "@/features/chat/utils/types"
import { projectReasoning } from "@/features/chat/utils/project-reasoning"
import type { ChatEntry, ReasoningStep } from "@/features/chat/utils/types"

export type ChatThreadProps = {
  /**
   * Already-filtered entries (by display mode, sidebar selection, etc.).
   * `ChatThread` does not look at mode itself.
   */
  entries: ChatEntry[]
  /** Hover-revealed action buttons for user bubbles (e.g. Copy / Edit). */
  userActions?: ReactNode
  /** Hover-revealed action buttons for assistant bubbles (e.g. Copy / Regenerate). */
  assistantActions?: ReactNode
  /**
   * Tooltip / wrap of the timestamp on user bubbles:
   *   - "short" → hh:mm (default, matches the playground)
   *   - "long"  → dd/mm/yyyy hh:mm (matches the operator conversation)
   */
  timeFormat?: "short" | "long"
  /** Rendered in place of any entry list when the thread is empty. */
  emptyState?: ReactNode
  /**
   * Display mode forwarded by the caller (e.g. playground `debug`
   * view). Used only to widen the reasoning block's max width —
   * user/agent rows keep their default narrow cap because long
   * content is unreadable when stretched, and the chat layout remains
   * consistent across views.
   */
  mode?: "client" | "debug"
  /** Pin every user / assistant bubble to the compact size step
   *  (tighter padding, smaller type). Reasoning blocks are already
   *  compact and unaffected. */
  compact?: boolean
  /**
   * Whether the thread's `<ol>` owns its own scrollbar. Default `true`
   * (the thread scrolls itself). Set `false` when the caller wraps the
   * thread in their own scrolling container — typically so the scrollbar
   * sits at the pane's right edge instead of at the right edge of a
   * centered, max-w column. The auto-scroll-to-bottom effect follows
   * the same flag: it only fires when `true`.
   */
  scroll?: boolean
  /**
   * Extra classes merged onto the thread's scroll container. Lets
   * callers reserve space for an overlapping composer without
   * rendering a parallel scroll wrapper.
   */
  className?: string
  /** Inline style merged onto the thread's scroll container (e.g.
   *  a measured `paddingBottom` for a floating composer). */
  style?: CSSProperties
}

/**
 * Generic chat thread. Renders a vertical list of:
 *   - user bubbles (`<ChatMessage from="user">`, accent, right-aligned,
 *     hover-revealed actions)
 *   - assistant bubbles (`<ChatMessage from="assistant">`, plain text,
 *     left-aligned)
 *   - system pills (centred, neutral)
 *   - reasoning blocks (`<ThinkingSteps>`, auto-expanded while
 *     streaming, collapsed after `reasoning.completed`)
 *
 * No "thinking" trailing indicator is rendered: the reasoning block itself
 * is the streaming signal — its first active step carries the live
 * progress and the block auto-collapses when the model finishes.
 *
 * Stays a controlled, presentational surface: state, transport, retries
 * and approvals live with the caller. The same renderer powers both the
 * playground sandbox and the operator conversation detail.
 */
export function ChatThread({
  entries,
  userActions,
  assistantActions,
  timeFormat = "short",
  emptyState,
  mode = "client",
  compact = false,
  scroll = true,
  className,
  style,
}: ChatThreadProps) {
  const scrollRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    // When the caller owns the scroll container (scroll={false}) the
    // thread's `<ol>` doesn't scroll, so there's no point pinning it.
    if (!scroll) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries, scroll])

  // Self-scrolling thread: grows inside its flex parent (`flex-1`).
  // Externally-scrolled thread: fills the scroll container in height
  // (`min-h-full`) and starts content from the top, so the first message
  // sits at the top of the pane (not pinned to the bottom). Left padding
  // is bumped (`pl-8`) so the assistant bubble — which is `items-start`
  // inside ChatMessage — doesn't sit glued to the column edge.
  const olClassName = scroll
    ? `flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4${className ? ` ${className}` : ""}`
    : `flex min-h-full flex-col gap-2 px-4 py-4 pl-8${className ? ` ${className}` : ""}`

  return (
    <ol
      ref={scrollRef}
      className={olClassName}
      style={style}
    >
      {entries.length === 0 && emptyState ? (
        <li className="contents">{emptyState}</li>
      ) : null}
      {entries.map((entry) => (
        <li
          key={entry.id}
          // `block` (not `contents`) so the row has a real box —
          // `getBoundingClientRect` on a `display: contents` element
          // returns zero in Firefox/Safari, which would break the
          // `scrollToMessage` measurement that uses the row's top
          // edge as the anchor. Visual layout is identical because
          // the surrounding `<ol>` is `flex-col gap-2` and the row
          // is the only child of the `<li>`.
          data-entry-id={entry.id}
        >
          <EntryRow
            entry={entry}
            userActions={userActions}
            assistantActions={assistantActions}
            timeFormat={timeFormat}
            mode={mode}
            compact={compact}
          />
        </li>
      ))}
    </ol>
  )
}

function EntryRow({
  entry,
  userActions,
  assistantActions,
  timeFormat,
  mode,
  compact,
}: {
  entry: ChatEntry
  userActions?: ReactNode
  assistantActions?: ReactNode
  timeFormat: "short" | "long"
  mode: "client" | "debug"
  compact: boolean
}) {
  const side = entrySide(entry)

  switch (entry.kind) {
    case "user": {
      return (
        // Right rail: a flex row that fills the thread column width
        // and pushes the bubble to the trailing edge. The bubble
        // wrapper is capped at `max-w-md` (28 rem ≈ 448 px) so a
        // long user message can't sprawl into the agent's lane —
        // together with the column's max-w-5xl this leaves a 128 px
        // gap between the two rails at max width.
        <div className="flex w-full justify-end">
          <div className="w-full max-w-md">
            <ChatMessage
              from="user"
              size={compact ? "compact" : "default"}
              // `!max-w-none` overrides ChatMessage's default
              // `max-w-[80%]` so the bubble fills its md-cap
              // wrapper instead of stopping at 80% of the column.
              className="!max-w-none"
              time={
                <time
                  dateTime={new Date(entry.createdAt).toISOString()}
                  suppressHydrationWarning
                >
                  {timeFormat === "long"
                    ? longDateTimeLabel(entry.createdAt)
                    : clockLabel(entry.createdAt)}
                </time>
              }
              actions={userActions}
            >
              {entry.content}
            </ChatMessage>
          </div>
        </div>
      )
    }
    case "agent": {
      return (
        // Left rail: mirror of the user case. Justify-start pins
        // the bubble to the leading edge; the md-cap wrapper
        // guarantees the same 128 px separation from the user's
        // lane.
        <div className="flex w-full justify-start">
          <div className="w-full max-w-md">
            <ChatMessage
              from="assistant"
              size={compact ? "compact" : "default"}
              className="!max-w-none"
              actions={assistantActions}
            >
              {entry.content}
            </ChatMessage>
          </div>
        </div>
      )
    }
    case "system": {
      return (
        <div
          className={
            mode === "debug"
              ? "w-full max-w-5xl self-center text-center"
              : "w-full max-w-[560px] self-center text-center"
          }
          data-sender="system"
        >
          <span className="inline-block rounded-full border border-line/40 bg-canvas/60 px-3 py-1 text-[11.5px] text-ink-3">
            {entry.content}
          </span>
        </div>
      )
    }
    case "tool": {
      // Tool entries are kept in the type system for forward
      // compatibility but no longer rendered as a card in the thread.
      // Future tool-aware surfaces (operator inspector, sandbox
      // sidebar) can opt back in by reading the same entry shape.
      void side
      return null
    }
    case "reasoning": {
      const projected = projectReasoning(entry)
      // Multi-step path: when the entry carries a `steps` array, render
      // a full ThinkingSteps block with one ThinkingStep per entry.
      // Each step's `status` (complete | active | pending) comes from
      // the data so the caller controls streaming — pending steps
      // return `null` from `ThinkingStep` and don't reserve space,
      // letting the block grow incrementally.
      if (entry.steps && entry.steps.length > 0) {
        return (
          <div
            className={
              mode === "debug" ? "w-full max-w-5xl" : "w-full max-w-[560px]"
            }
            data-reasoning
            data-finalized={entry.finalized}
          >
            <ThinkingSteps
              size="compact"
              defaultOpen={!entry.finalized}
              // `ThinkingSteps` defaults to `w-80 max-w-full`, which caps
              // the whole Razonamiento block at 20rem regardless of the
              // surrounding container width. In debug mode we drop the cap
              // so the label + description can use the full container
              // width.
              className={mode === "debug" ? "!w-full !max-w-full" : undefined}
            >
              <ThinkingStepsHeader>{projected.label}</ThinkingStepsHeader>
              <ThinkingStepsContent>
                {entry.steps.map((step, index) => (
                  <ReasoningStepRow
                    key={`${entry.id}-${index}`}
                    step={step}
                    isLast={index === entry.steps!.length - 1}
                  />
                ))}
              </ThinkingStepsContent>
            </ThinkingSteps>
          </div>
        )
      }
      // Single-step fallback for entries without a `steps` array.
      return (
        <div
          className={
            mode === "debug" ? "w-full max-w-5xl" : "w-full max-w-[560px]"
          }
          data-reasoning
          data-finalized={entry.finalized}
        >
          <ThinkingSteps
            size="compact"
            defaultOpen={!entry.finalized}
            className={mode === "debug" ? "!w-full !max-w-full" : undefined}
          >
            <ThinkingStepsHeader>{projected.label}</ThinkingStepsHeader>
            <ThinkingStepsContent>
              <ThinkingStep
                icon="dot"
                showIcon={false}
                label="Razonamiento"
                description={projected.description}
                status={entry.finalized ? "complete" : "active"}
                isLast
              />
            </ThinkingStepsContent>
          </ThinkingSteps>
        </div>
      )
    }
  }
}

/**
 * Renders a single `ReasoningStep` as a `<ThinkingStep>` with the
 * appropriate icon, label, description, status and inline children
 * (sources, details, image). Children are optional and rendered only
 * when the matching fields are present on the step.
 *
 * Lives next to the entry row because the renderer is the only
 * caller and it keeps the data → component mapping in one place.
 */
function ReasoningStepRow({
  step,
  isLast,
}: {
  step: ReasoningStep
  isLast: boolean
}) {
  return (
    <ThinkingStep
      icon={step.icon as never}
      label={step.label}
      description={step.description}
      status={step.status}
      isLast={isLast}
    >
      {step.sources && step.sources.length > 0 ? (
        <ThinkingStepSources>
          {step.sources.map((source) => (
            <ThinkingStepSource key={source}>{source}</ThinkingStepSource>
          ))}
        </ThinkingStepSources>
      ) : null}
      {step.details ? (
        <ThinkingStepDetails
          summary={step.details.summary}
          details={step.details.items}
        />
      ) : null}
      {step.image ? (
        <ThinkingStepImage
          src={step.image.src}
          alt={step.image.alt}
          caption={step.image.caption}
        />
      ) : null}
    </ThinkingStep>
  )
}
