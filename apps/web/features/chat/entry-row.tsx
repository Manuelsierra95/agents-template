import type { ReactNode } from "react"

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

/**
 * Props for `<EntryRow />`. The renderer is the only place the chat
 * feature turns a `ChatEntry` into a concrete row (user bubble, agent
 * bubble, system pill, reasoning block, tool card stub). It is shared
 * between `ChatThread` (the self-scrolling thread used by the
 * playground / operator detail) and `MessageScrollerThread` (the new
 * thread rendered inside a shadcn `MessageScroller`).
 *
 * Keeping the row component out of either thread makes the data →
 * component mapping live in exactly one place, so the two threads can
 * never drift.
 */
export type EntryRowProps = {
  entry: ChatEntry
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
}

/**
 * Renders a single `ChatEntry` as a row.
 *
 *  - `kind: "user"`     → right-rail user bubble with timestamp + actions.
 *  - `kind: "agent"`    → left-rail assistant bubble with optional actions.
 *  - `kind: "system"`   → centred, neutral status pill.
 *  - `kind: "tool"`     → reserved for forward compatibility (renders null
 *                         today; future tool-aware surfaces opt back in
 *                         by reading the same entry shape).
 *  - `kind: "reasoning"` → collapsible `ThinkingSteps` block with one
 *                         `ThinkingStep` per step. Auto-opens while
 *                         streaming (`!entry.finalized`), collapses once
 *                         the model signals completion.
 *
 * No "thinking" trailing indicator is rendered: the reasoning block
 * itself is the streaming signal — its first active step carries the
 * live progress and the block auto-collapses when the model finishes.
 */
export function EntryRow({
  entry,
  userActions,
  assistantActions,
  timeFormat = "short",
  mode = "client",
  compact = false,
}: EntryRowProps) {
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
