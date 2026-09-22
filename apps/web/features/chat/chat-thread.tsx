"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"

import { EntryRow, type EntryRowProps } from "@/features/chat/entry-row"
import type { ChatEntry } from "@/features/chat/utils/types"

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
 * The actual data → row mapping lives in `<EntryRow />`
 * (`features/chat/entry-row.tsx`) and is shared with the sibling
 * `MessageScrollerThread`, so both threads render identical rows.
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

/**
 * Re-export so existing callers that import `EntryRow` or its props
 * directly from `@/features/chat/chat-thread` keep compiling. The
 * canonical import path is `@/features/chat/entry-row`; this barrel
 * stays for backward compatibility.
 */
export type { EntryRowProps }
export { EntryRow }
