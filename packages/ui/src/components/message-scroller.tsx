"use client"

import * as React from "react"
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@shadcn/react/message-scroller"
import { ArrowDown } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils.ts"
import { Button } from "@workspace/ui/components/button"

/**
 * MessageScroller — chat transcript scroller built on `@shadcn/react`.
 *
 * Owns the scroll behaviour that streaming chats need: opening position,
 * auto-scroll on stream, release on user scroll, new-turn anchoring,
 * prepended-history preservation, visibility tracking, and jump-to-message
 * commands. Stays unopinionated about message rendering — callers compose
 * their own row primitives inside `MessageScrollerItem`.
 *
 * Composition (verbatim shadcn demo, mirrored at Tier-1):
 *
 *   <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
 *     <MessageScroller>
 *       <MessageScrollerViewport>
 *         <MessageScrollerContent>
 *           {messages.map(m => (
 *             <MessageScrollerItem
 *               key={m.id}
 *               messageId={m.id}
 *               scrollAnchor={m.role === "user"}
 *             >
 *               {/* row content *\/}
 *             </MessageScrollerItem>
 *           ))}
 *         </MessageScrollerContent>
 *       </MessageScrollerViewport>
 *       <MessageScrollerButton />
 *     </MessageScroller>
 *   </MessageScrollerProvider>
 *
 * Behaviour map vs. the legacy hand-rolled state machine this replaces:
 *
 *   - `autoScroll` — follow the live edge while the reader is pinned.
 *   - `defaultScrollPosition="last-anchor"` — open saved threads at the
 *     last user message, not the absolute bottom.
 *   - `scrollPreviousItemPeek` — keep a slice of the previous item visible
 *     above the new anchor so context is not lost.
 *   - `scrollAnchor={true}` on a user item — that row settles near the top
 *     when it lands; the answer streams into the room below it.
 *   - `MessageScrollerButton` — "↓ scroll to end" control that hides
 *     itself when there's nothing new and re-engages follow on click.
 *
 * Tokens: this component ships with the verbatim shadcn `base-mira`
 * styling (bg-background, text-foreground, border-border). The project's
 * tokens (`bg-canvas`, `text-ink-2`, `border-line`) alias the same
 * values via `@theme inline`, so the result is theme-coherent.
 */

function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>,
) {
  return <MessageScrollerPrimitive.Provider {...props} />
}

function MessageScroller({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      data-slot="message-scroller"
      className={cn(
        "group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  )
}

function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      data-slot="message-scroller-viewport"
      className={cn(
        "size-full min-h-0 min-w-0 scroll-fade-b scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent data-pending-scroll:invisible",
        className,
      )}
      {...props}
    />
  )
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      data-slot="message-scroller-content"
      className={cn("flex h-max min-h-full flex-col gap-6", className)}
      {...props}
    />
  )
}

function MessageScrollerItem({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      className={cn(
        "min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]",
        className,
      )}
      {...props}
    />
  )
}

type MessageScrollerButtonProps = React.ComponentProps<
  typeof MessageScrollerPrimitive.Button
> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">

function MessageScrollerButton({
  direction = "end",
  className,
  children,
  render,
  variant = "secondary",
  size = "icon-sm",
  ...props
}: MessageScrollerButtonProps) {
  return (
    <MessageScrollerPrimitive.Button
      data-slot="message-scroller-button"
      data-direction={direction}
      data-variant={variant}
      data-size={size}
      direction={direction}
      className={cn(
        "absolute inset-s-1/2 -translate-x-1/2 border-border bg-background text-foreground transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-400 data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)] data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[active=true]:ease-[cubic-bezier(0.23,1,0.32,1)] data-[direction=end]:bottom-4 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full rtl:translate-x-1/2 data-[direction=start]:[&_svg]:rotate-180",
        className,
      )}
      render={render ?? <Button variant={variant} size={size} />}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDown aria-hidden="true" />
          <span className="sr-only">
            {direction === "end" ? "Ir al final" : "Ir al inicio"}
          </span>
        </>
      )}
    </MessageScrollerPrimitive.Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
}
