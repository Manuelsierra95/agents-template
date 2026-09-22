"use client"

import { useRef, useState, type CSSProperties } from "react"

import {
  InputMessage,
  MessageScrollerThread,
  type ChatEntry,
} from "@/features/chat"
import { useChatStream } from "@/features/chat/use-chat-stream"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"

// Reserved footprint for the floating composer at the bottom of the
// viewport. The scroller's `--scroll-fade-b-size` reads from this so
// the bottom of the thread fades out exactly where the composer
// overlays it; `MessageScrollerContent`'s `paddingBottom` reads from
// the same var so the last message never sits under the overlay.
const COMPOSER_RESERVED = "10rem"

// Distance from the viewport bottom to the composer box. The
// composer wrapper is positioned with `bottom: var(--composer-offset)`
// and `MessageScrollerButton` is pinned just above it.
const COMPOSER_OFFSET = "1rem"

// Suggestion list shown in `InputMessage` only when the conversation
// has not started yet. On the first user send we flip to the
// compact size ladder and stop showing suggestions — the persona
// explains the rule.
const SUGGESTIONS = [
  "What is Fluid Functionalism about?",
  "How does Micka tune the springs behind these animations?",
  "Install the InputMessage component in my project",
  "Draft a short thank-you note to Micka for the library",
]

// Default phone used when the operator hasn't picked a customer yet.
// Single-tenant for now: every chat session in this apps/web maps
// to the same `apps/api` conversation for this phone. Multi-tenant
// scoping lands when the operator UI picks an org.
const DEFAULT_CUSTOMER_PHONE = "+34600000000"

/**
 * Stateful chat shell for `/dashboard/chat`.
 *
 * Layout: a flex column with `MessageScroller` filling the scroll
 * viewport and `InputMessage` floated absolutely over the bottom
 * edge. The composer overlay footprint is exposed via two CSS
 * variables (`--composer-offset`, `--composer-reserved`) on the
 * outer relative wrapper — the scroller's bottom fade
 * (`--scroll-fade-b-size`), the content's `paddingBottom`, and the
 * jump-to-latest button's vertical position all read from them via
 * `calc()`, so no magic numbers are scattered across expressions.
 *
 * Source of truth:
 *   - `useChatStream` owns the entry list (`entries`), the streaming
 *     status, and the abort controller. It POSTs to `apps/api`'s
 *     `/api/chat/messages` and parses Eve's NDJSON into `ChatEntry`s.
 *
 */
export function ChatPanel() {
  // The hook drives everything we render. We only keep local state
  // for the composer (controlled textarea + attachments), and a ref
  // to bridge the old InputMessage attach button (unused but kept
  // available so the comment block above stays accurate).
  const chat = useChatStream({ customerPhone: DEFAULT_CUSTOMER_PHONE })
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const composerRef = useRef<HTMLDivElement | null>(null)

  // Mirror `entries` into `MessageScrollerThread` so the existing
  // component contract (it expects `entries`) does not change.
  const entries = chat.entries

  // CSS vars on the outer relative wrapper. Same contract as the
  // previous implementation; every consumer (scroller fade, content
  // paddingBottom, jump-to-latest button position) reads via `calc()`.
  const composerVars = {
    "--composer-offset": COMPOSER_OFFSET,
    "--composer-reserved": COMPOSER_RESERVED,
  } as CSSProperties

  async function handleSend(text: string) {
    // The hook takes care of optimistic entry append + abort + status.
    // We clear local composer state on submit so the textarea resets.
    await chat.send(text)
    setDraft("")
    setFiles([])
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={composerVars}>
      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition="last-anchor"
        scrollPreviousItemPeek={96}
      >
        <MessageScroller className="pt-2">
          <MessageScrollerViewport
            style={
              {
                "--scroll-fade-b-size": "var(--composer-reserved)",
              } as CSSProperties
            }
          >
            <MessageScrollerContent
              className="mx-auto w-full max-w-5xl"
              style={{ paddingBottom: "var(--composer-reserved)" }}
            >
              <MessageScrollerThread
                entries={entries}
                compact={entries.length > 0}
              />
              {chat.error ? (
                <div
                  role="alert"
                  className="mx-auto mt-2 w-full max-w-3xl rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
                >
                  {chat.error}
                </div>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton
            style={{
              bottom: "calc(var(--composer-reserved) + 0.5rem)",
            }}
          />
        </MessageScroller>
      </MessageScrollerProvider>
      <div
        className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-4"
        style={{ bottom: "var(--composer-offset)" }}
      >
        <InputMessage
          ref={composerRef}
          className="pointer-events-auto w-full max-w-3xl bg-secondary"
          size={entries.length > 0 ? "compact" : undefined}
          value={draft}
          onValueChange={setDraft}
          onSend={handleSend}
          onStop={chat.cancel}
          status={chat.status === "streaming" ? "streaming" : "idle"}
          placeholderSuggestion={
            entries.length > 0
              ? undefined
              : "Why is every other input box so stiff?"
          }
          suggestions={entries.length > 0 ? undefined : SUGGESTIONS}
          history={[]}
          files={files}
          onFilesChange={setFiles}
          clickToFocus
          sendLabel="Enviar"
          data-testid="chat-composer-input"
        />
      </div>
    </div>
  )
}
