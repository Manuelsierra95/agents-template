import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react"

import { ChatPanel } from "@/app/dashboard/chat/_components/chat-panel"
import type { ChatEntry } from "@/features/chat"

import type { UseChatStreamResult } from "@/features/chat/use-chat-stream"

/**
 * Phase 2E chat-panel tests.
 *
 * The legacy tests asserted against a hand-rolled simulation. That
 * whole surface is gone — `ChatPanel` now delegates to
 * `useChatStream`, which is the unit we mock here. We assert:
 *  - the outer wrapper exposes the composer CSS vars (`--composer-offset`,
 *    `--composer-reserved`) and not the legacy `--composer-height`
 *    / `--composer-fade`.
 *  - the MessageScroller primitives are mounted (`role="region"`,
 *    `role="log"`, the jump-to-latest button is in the tree).
 *  - the hook's `entries` flow into `MessageScrollerThread` as
 *    `<div data-message-id>` items.
 *  - the hook's `error` renders as a destructive banner.
 *
 * Use `vi.mock("@/features/chat/use-chat-stream", …)` so we don't
 * touch the network.
 */

const mockHookReturns: { current: Partial<UseChatStreamResult> } = {
  current: {
    entries: [] as ChatEntry[],
    status: "idle" as const,
    error: null,
    conversationId: null,
    send: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  },
}

vi.mock("@/features/chat/use-chat-stream", () => ({
  useChatStream: () => mockHookReturns.current,
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mockHookReturns.current.entries = []
  mockHookReturns.current.status = "idle"
  mockHookReturns.current.error = null
  mockHookReturns.current.conversationId = null
  ;(mockHookReturns.current.send as ReturnType<typeof vi.fn>).mockReset()
  ;(mockHookReturns.current.cancel as ReturnType<typeof vi.fn>).mockReset()
  ;(mockHookReturns.current.reset as ReturnType<typeof vi.fn>).mockReset()
})

beforeEach(() => {
  // The MessageScroller hooks need both ResizeObserver and MutationObserver
  // in jsdom.
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  class StubMutationObserver {
    observe(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return []
    }
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    StubResizeObserver
  ;(globalThis as { MutationObserver?: unknown }).MutationObserver =
    StubMutationObserver
})

describe("ChatPanel — composer geometry (CSS vars)", () => {
  it("exposes --composer-offset and --composer-reserved on the outer wrapper", () => {
    render(<ChatPanel />)
    const composer = screen.getByTestId("chat-composer-input")
    // composer → absolute wrapper → relative outer wrapper
    const outer = composer.parentElement?.parentElement as HTMLElement
    expect(outer?.style.getPropertyValue("--composer-offset")).toBe("1rem")
    expect(outer?.style.getPropertyValue("--composer-reserved")).toBe("10rem")
    // The legacy --composer-height / --composer-fade vars are gone —
    // the scroller now reads the single --composer-reserved.
    expect(outer?.style.getPropertyValue("--composer-height")).toBe("")
    expect(outer?.style.getPropertyValue("--composer-fade")).toBe("")
  })
})

describe("ChatPanel — MessageScroller integration", () => {
  it("renders the scroller viewport with role=region and aria-label", () => {
    render(<ChatPanel />)
    const viewport = screen.getByRole("region", { name: "Messages" })
    expect(viewport).toBeTruthy()
    expect(viewport.className).toContain("scroll-fade-b")
  })

  it("renders the content area with role=log so screen readers announce additions", () => {
    const { container } = render(<ChatPanel />)
    const content = container.querySelector('[role="log"]')
    expect(content).toBeTruthy()
    expect(content?.getAttribute("aria-relevant")).toBe("additions")
  })

  it("mounts the jump-to-latest button", () => {
    render(<ChatPanel />)
    expect(
      screen.getByRole("button", { name: /ir al final|scroll to end/i }),
    ).toBeTruthy()
  })
})

describe("ChatPanel — entries flow through MessageScrollerThread", () => {
  it("renders one <div data-message-id> per entry from the hook", () => {
    mockHookReturns.current.entries = [
      {
        id: "u1",
        kind: "user",
        content: "hola",
        createdAt: Date.now(),
      },
      {
        id: "a1",
        kind: "agent",
        content: "buenos días",
        createdAt: Date.now(),
      },
    ] as ChatEntry[]
    const { container } = render(<ChatPanel />)
    const items = container.querySelectorAll<HTMLElement>("[data-message-id]")
    expect(items.length).toBe(2)
  })

  it("user entries get data-scroll-anchor=true; agent entries get false", () => {
    mockHookReturns.current.entries = [
      {
        id: "u1",
        kind: "user",
        content: "hola",
        createdAt: Date.now(),
      },
      {
        id: "a1",
        kind: "agent",
        content: "buenos días",
        createdAt: Date.now(),
      },
    ] as ChatEntry[]
    const { container } = render(<ChatPanel />)
    const items = container.querySelectorAll<HTMLElement>("[data-message-id]")
    const userItem = Array.from(items).find((el) =>
      el.textContent?.includes("hola"),
    )
    const agentItem = Array.from(items).find((el) =>
      el.textContent?.includes("buenos días"),
    )
    expect(userItem?.dataset.scrollAnchor).toBe("true")
    expect(agentItem?.dataset.scrollAnchor).toBe("false")
  })
})

describe("ChatPanel — error rendering", () => {
  it("shows the hook's error message as a destructive banner", () => {
    mockHookReturns.current.error = "Eve runtime is not reachable."
    const { container } = render(<ChatPanel />)
    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert?.textContent).toContain("Eve runtime is not reachable.")
  })

  it("does not render the banner when the hook has no error", () => {
    mockHookReturns.current.error = null
    const { container } = render(<ChatPanel />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe("ChatPanel — composer send wires to the hook", () => {
  it("calls hook.send(text) when the user submits a message", async () => {
    render(<ChatPanel />)
    const composer = screen.getByTestId("chat-composer-input")
    const textarea = composer.querySelector("textarea") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "hola" } })
    const buttons = Array.from(composer.querySelectorAll("button"))
    const sendButton = buttons[buttons.length - 1]
    await act(async () => {
      fireEvent.click(sendButton!)
    })
    await waitFor(() => {
      expect(mockHookReturns.current.send).toHaveBeenCalledWith("hola")
    })
  })
})

void act
