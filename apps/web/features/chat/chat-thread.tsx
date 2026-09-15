"use client"

import { useEffect, useRef, type ReactNode } from "react"
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
}: ChatThreadProps) {
  const scrollRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <ol
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
    >
      {entries.length === 0 && emptyState ? (
        <li className="contents">{emptyState}</li>
      ) : null}
      {entries.map((entry) => (
        <li key={entry.id} className="contents">
          <EntryRow
            entry={entry}
            userActions={userActions}
            assistantActions={assistantActions}
            timeFormat={timeFormat}
            mode={mode}
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
}: {
  entry: ChatEntry
  userActions?: ReactNode
  assistantActions?: ReactNode
  timeFormat: "short" | "long"
  mode: "client" | "debug"
}) {
  const side = entrySide(entry)

  switch (entry.kind) {
    case "user": {
      return (
        <ChatMessage
          from="user"
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
      )
    }
    case "agent": {
      return (
        <ChatMessage from="assistant" actions={assistantActions}>
          {entry.content}
        </ChatMessage>
      )
    }
    case "system": {
      return (
        <div
          className={
            mode === "debug" ? "w-full max-w-5xl" : "w-full max-w-[560px]"
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
