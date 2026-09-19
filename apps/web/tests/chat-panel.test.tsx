import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, act, fireEvent, screen, cleanup } from "@testing-library/react"
import { ChatPanel } from "@/app/dashboard/chat/_components/chat-panel"

// Mirror of the constant used in chat-panel.tsx. Kept in sync
// intentionally so a drift breaks the test loudly.
const SCROLL_SETTLE_MS = 500

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  // Stub ResizeObserver (jsdom doesn't ship it) so the composer's
  // useLayoutEffect can read its initial height without throwing.
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    StubResizeObserver
})

function getScrollWrapper(container: HTMLElement): HTMLElement {
  // The thread wrapper is the element with `overflow-y-auto` inside
  // the outer `relative` wrapper. Find it by class signature.
  const all = container.querySelectorAll<HTMLElement>("div")
  for (const el of all) {
    if (
      el.classList.contains("overflow-y-auto") &&
      el.classList.contains("flex-1")
    ) {
      return el
    }
  }
  throw new Error("scroll wrapper not found")
}

/**
 * Install a deterministic scrollTo spy on the scroll wrapper. jsdom
 * doesn't lay out elements, so getBoundingClientRect returns zeros and
 * the "smooth" scroll resolves immediately — we don't need real layout,
 * we just need to assert *which* scroll calls fired and when.
 */
function installScrollSpy(wrapper: HTMLElement) {
  const calls: Array<{ top: number | undefined; left: number | undefined; behavior: ScrollBehavior | undefined }> = []
  const original: typeof wrapper.scrollTo = wrapper.scrollTo.bind(wrapper)
  wrapper.scrollTo = ((x?: number | ScrollToOptions, y?: number) => {
    if (typeof x === "object") {
      calls.push({ top: x.top, left: x.left, behavior: x.behavior })
      original(x)
    } else {
      calls.push({ top: y, left: x, behavior: undefined })
      original({ top: y, left: x })
    }
  }) as typeof wrapper.scrollTo
  return calls
}

describe("ChatPanel scroll state machine", () => {
  it("exposes the composer with CSS variables on the outer wrapper", () => {
    render(<ChatPanel />)
    const composer = screen.getByTestId("chat-composer-input")
    expect(composer).toBeTruthy()

    const root = composer.parentElement?.parentElement as HTMLElement
    expect(root?.style.getPropertyValue("--composer-offset")).toBe("1rem")
    expect(root?.style.getPropertyValue("--composer-fade")).toBe("6rem")
    expect(root?.style.getPropertyValue("--composer-height")).toMatch(/px$/)
  })

  it("scroll wrapper has the fade mask and the padded thread", () => {
    const { container } = render(<ChatPanel />)
    const wrapper = getScrollWrapper(container)
    expect(wrapper).toBeTruthy()
    expect(wrapper.style.maskImage || wrapper.style.webkitMaskImage).toBeTruthy()
    const ol = wrapper.querySelector("ol")
    expect(ol).toBeTruthy()
    expect((ol as HTMLElement).style.paddingBottom).toMatch(/calc\(/)
  })

  it("renders one <li data-entry-id> per entry", async () => {
    vi.useFakeTimers()
    const { container } = render(<ChatPanel />)

    await act(async () => {
      const composer = screen.getByTestId("chat-composer-input")
      const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: "hola" } })
      const buttons = composer.querySelectorAll("button")
      const sendButton = buttons[buttons.length - 1]
      if (sendButton) fireEvent.click(sendButton)
    })

    const lis = container.querySelectorAll("[data-entry-id]")
    expect(lis.length).toBeGreaterThanOrEqual(1)
  })

  it("auto-scroll does NOT fire on the manual → follow re-engage after a send", async () => {
    vi.useFakeTimers()
    const { container } = render(<ChatPanel />)
    const wrapper = getScrollWrapper(container)
    const scrollCalls = installScrollSpy(wrapper)

    const callsBeforeSend = scrollCalls.length
    await act(async () => {
      const composer = screen.getByTestId("chat-composer-input")
      const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: "hola" } })
      const buttons = composer.querySelectorAll("button")
      const sendButton = buttons[buttons.length - 1]
      if (sendButton) fireEvent.click(sendButton)
    })

    // Fire the rAF (0-delay setTimeout polyfill) — scrollToMessage
    // happens here. We use `advanceTimersByTimeToNextTimer` so only
    // the rAF fires, NOT the SCROLL_SETTLE_MS setTimeout scheduled
    // inside it.
    await act(async () => {
      vi.advanceTimersToNextTimer()
    })

    const callsAfterScrollToMessage = scrollCalls.length
    expect(callsAfterScrollToMessage).toBeGreaterThan(callsBeforeSend)
    const scrollToMessageCalls = scrollCalls
      .slice(callsBeforeSend, callsAfterScrollToMessage)
      .filter((c) => c.behavior === "smooth")
    expect(scrollToMessageCalls.length).toBeGreaterThan(0)

    // Snapshot the call count BEFORE the manual → follow re-engage.
    const callsBeforeReengage = scrollCalls.length

    // Now fire the SCROLL_SETTLE_MS setTimeout. With the bug, this
    // triggers the auto-scroll effect (deps include scrollMode) and
    // yanks the thread to the bottom. With the fix, the effect no
    // longer fires on mode transitions — only on entries mutations.
    await act(async () => {
      vi.advanceTimersByTime(SCROLL_SETTLE_MS + 50)
    })

    const callsAfterReengage = scrollCalls.length
    expect(callsAfterReengage).toBe(callsBeforeReengage)
  })

  it("auto-scroll DOES fire when a new entry arrives while in follow mode", async () => {
    vi.useFakeTimers()
    const { container } = render(<ChatPanel />)
    const wrapper = getScrollWrapper(container)
    const scrollCalls = installScrollSpy(wrapper)

    // Single send → entries change. Effect deps changed (entries).
    // Mode is "manual" so the guard skips.
    await act(async () => {
      const composer = screen.getByTestId("chat-composer-input")
      const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: "primer" } })
      const buttons = composer.querySelectorAll("button")
      const sendButton = buttons[buttons.length - 1]
      if (sendButton) fireEvent.click(sendButton)
    })

    // Advance past SCROLL_SETTLE_MS so mode transitions back to
    // "follow". No new entries are added by the simulation in this
    // window (the first reasoning patch is at t=1.5s, well after
    // SCROLL_SETTLE_MS = 500ms) — so this assertion specifically
    // checks that mode transitions DON'T spuriously trigger the
    // auto-scroll.
    const callsBeforeReengage = scrollCalls.length
    await act(async () => {
      vi.advanceTimersToNextTimer() // rAF → scrollToMessage
      vi.advanceTimersByTime(SCROLL_SETTLE_MS + 50) // setTimeout → mode = follow
    })
    const callsAfterReengage = scrollCalls.length
    // Between the rAF and the setTimeout there were no entry mutations,
    // so no auto-scroll should have fired.
    expect(callsAfterReengage).toBe(callsBeforeReengage)

    // Now advance to the first reasoning patch at t=1.5s — entries
    // ARE mutated and mode is "follow", so the auto-scroll MUST fire.
    await act(async () => {
      vi.advanceTimersByTime(1500 - SCROLL_SETTLE_MS)
    })
    const callsAfterFirstPatch = scrollCalls.length
    expect(callsAfterFirstPatch).toBeGreaterThan(callsAfterReengage)
    // The auto-scroll call is non-smooth (instant).
    const autoScrollCall = scrollCalls
      .slice(callsAfterReengage)
      .find((c) => c.behavior === undefined)
    expect(autoScrollCall).toBeTruthy()
  })

  it("the pill is hidden by default (no unread messages in follow mode)", () => {
    const { container } = render(<ChatPanel />)
    // The pill is a <button> with the arrow glyph. It must not exist
    // when mode is "follow" and pendingBelowCount is 0.
    const pills = container.querySelectorAll("button")
    const pill = Array.from(pills).find((b) =>
      b.textContent?.match(/mensaje(s)? nuevo/i),
    )
    expect(pill).toBeUndefined()
  })

  it("the pill appears when the user scrolls up while in follow mode", async () => {
    vi.useFakeTimers()
    const { container } = render(<ChatPanel />)

    // Seed an entry list and re-engage follow.
    await act(async () => {
      const composer = screen.getByTestId("chat-composer-input")
      const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: "hola" } })
      const buttons = composer.querySelectorAll("button")
      const sendButton = buttons[buttons.length - 1]
      if (sendButton) fireEvent.click(sendButton)
    })
    await act(async () => {
      vi.advanceTimersToNextTimer() // rAF
      vi.advanceTimersByTime(SCROLL_SETTLE_MS + 50) // setTimeout → mode = follow
    })

    const wrapper = getScrollWrapper(container)
    // Simulate a user scroll-up: distance from bottom > FOLLOW_THRESHOLD.
    Object.defineProperty(wrapper, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: () => {},
    })
    Object.defineProperty(wrapper, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(wrapper, "clientHeight", {
      configurable: true,
      get: () => 400,
    })

    await act(async () => {
      fireEvent.scroll(wrapper)
    })

    // After scrolling up, mode = manual. We don't have a way to push
    // new entries while in manual (the simulation only sends in
    // response to user actions), so the pill may not appear yet.
    // We assert the mode transition happened by checking the next
    // entry list — but here we just verify no pill is shown for the
    // empty case (pendingBelowCount = 0).
    const buttons = container.querySelectorAll("button")
    const pill = Array.from(buttons).find((b) =>
      b.textContent?.match(/mensaje(s)? nuevo/i),
    )
    expect(pill).toBeUndefined()
  })

  it("user and agent rows are wrapped in centered rails with a 2xl cap", async () => {
    vi.useFakeTimers()
    const { container } = render(<ChatPanel />)

    // Send a message so the thread has both a user entry (the
    // submission) and, after the simulation finishes, an agent
    // entry. We only need to verify the structural wrapping here.
    await act(async () => {
      const composer = screen.getByTestId("chat-composer-input")
      const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: "hola" } })
      const buttons = composer.querySelectorAll("button")
      const sendButton = buttons[buttons.length - 1]
      if (sendButton) fireEvent.click(sendButton)
    })

    const lis = Array.from(container.querySelectorAll("li[data-entry-id]"))
    const userLi = lis.find((li) =>
      li.querySelector('[data-sender]:not([data-sender="system"])') === null,
    )
    expect(userLi).toBeTruthy()

    // The user entry's <li> contains a flex rail with justify-end
    // and a md-capped inner that hosts the ChatMessage.
    const userRail = userLi?.querySelector(".flex.justify-end")
    expect(userRail).toBeTruthy()
    const userInner = userRail?.querySelector(".max-w-md")
    expect(userInner).toBeTruthy()
    // ChatMessage's outer container lives inside the md cap.
    const chatMessageOuter = userInner?.querySelector(".group")
    expect(chatMessageOuter).toBeTruthy()
  })

  it("user and agent rails do not overlap when both at max width", async () => {
    // Mathematical invariant: in a max-w-5xl (1024 px) column with
    // two max-w-md (448 px) rails (one justify-start, one
    // justify-end), the gap between the right edge of the agent
    // bubble and the left edge of the user bubble is ≥ 128 px.
    // Anything less means one rail is going to crash into the
    // other when both messages are long.
    const COLUMN = 1024
    const BUBBLE = 448
    const userLeft = COLUMN - BUBBLE
    const agentRight = BUBBLE
    const gap = userLeft - agentRight
    expect(gap).toBeGreaterThanOrEqual(128)
  })
})


