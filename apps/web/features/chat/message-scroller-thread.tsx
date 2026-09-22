import { MessageScrollerItem } from "@workspace/ui/components/message-scroller"

import { EntryRow, type EntryRowProps } from "@/features/chat/entry-row"
import type { ChatEntry } from "@/features/chat/utils/types"

/**
 * Sibling of `ChatThread` rendered inside a shadcn `MessageScroller`.
 *
 * The scroller owns the scroll behaviour (anchoring, auto-follow,
 * release-on-scroll, jump-to-message); this component owns the data →
 * row mapping. It wraps each `ChatEntry` in a `MessageScrollerItem`
 * with a stable `messageId` (so `useMessageScroller` can target it
 * via `scrollToMessage(id)`) and marks user messages as `scrollAnchor`
 * so the viewport pins the new turn near the top when it arrives.
 *
 * Sits directly inside `MessageScrollerContent`:
 *
 *   <MessageScrollerContent>
 *     <MessageScrollerThread entries={entries} compact />
 *   </MessageScrollerContent>
 *
 * No outer wrapper element — `MessageScrollerContent` already supplies
 * the role="log" region and the live-region defaults, so this thread
 * just emits the items as a fragment.
 */
export type MessageScrollerThreadProps = Pick<
  EntryRowProps,
  "userActions" | "assistantActions" | "timeFormat" | "mode" | "compact"
> & {
  /** Already-filtered entries to render. */
  entries: ChatEntry[]
}

/**
 * Render `entries` as `<MessageScrollerItem>` rows. Each row gets:
 *  - `messageId={entry.id}` for stable targeting from
 *    `useMessageScroller().scrollToMessage(id)`.
 *  - `scrollAnchor={true}` for `kind: "user"` rows so the new turn
 *    settles near the top of the viewport when it lands; assistant,
 *    system, tool and reasoning rows are passive and stream into the
 *    room below the anchor.
 *
 * Reasoning/system/agent rows intentionally do **not** declare
 * `scrollAnchor`. Anchoring on every row would defeat the "anchor on
 * turn start" semantic the scroller is designed for.
 */
export function MessageScrollerThread({
  entries,
  userActions,
  assistantActions,
  timeFormat = "short",
  mode = "client",
  compact = false,
}: MessageScrollerThreadProps) {
  return (
    <>
      {entries.map((entry) => (
        <MessageScrollerItem
          key={entry.id}
          messageId={entry.id}
          scrollAnchor={entry.kind === "user"}
        >
          <EntryRow
            entry={entry}
            userActions={userActions}
            assistantActions={assistantActions}
            timeFormat={timeFormat}
            mode={mode}
            compact={compact}
          />
        </MessageScrollerItem>
      ))}
    </>
  )
}

// Re-export so callers can compose additional decorations around
// the items without re-importing from `@workspace/ui` directly.
export { MessageScrollerItem }
