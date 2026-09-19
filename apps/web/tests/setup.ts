import { vi, beforeEach } from "vitest"

// Mock ResizeObserver (jsdom doesn't ship it).
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(globalThis as any).ResizeObserver = MockResizeObserver
  // jsdom doesn't ship matchMedia — InputMessage uses it for hover/touch.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number
    globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function scrollTo(x?: number | ScrollToOptions, y?: number) {
      if (typeof x === "object") {
        this.scrollTop = x.top ?? this.scrollTop
        this.scrollLeft = x.left ?? this.scrollLeft
      } else {
        this.scrollTop = (y as number) ?? this.scrollTop
        this.scrollLeft = (x as number) ?? this.scrollLeft
      }
    }
  }
  vi.spyOn(console, "error").mockImplementation(() => {})
})
