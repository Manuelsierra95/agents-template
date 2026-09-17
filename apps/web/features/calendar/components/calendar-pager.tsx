"use client";

import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import { SETTLE_BACKSTOP_MS, SETTLE_IDLE_MS, SNAP_EPSILON, SUPPORTS_SCROLL_END } from "./lib";

export interface CalendarPagerHandle {
  scrollToIndex: (
    index: number,
    behavior: ScrollBehavior,
    onSettled?: () => void,
  ) => void;
}

interface CalendarPagerProps {
  pageStarts: Date[];
  centerIndex: number;
  gutter?: ReactNode;
  gutterWidth: number;
  renderPage: (start: Date) => ReactNode;
  onSettleDelta: (delta: number) => void;
}

export const CalendarPager = forwardRef<CalendarPagerHandle, CalendarPagerProps>(
  function CalendarPager(
    { pageStarts, centerIndex, gutter, gutterWidth, renderPage, onSettleDelta },
    ref,
  ) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const settleCallback = useRef<(() => void) | undefined>(undefined);
    const lastScrollLeft = useRef(0);
    const settlePending = useRef(false);

    const panelWidth = useCallback(() => {
      const el = scrollerRef.current;
      if (!el) return 1;
      return Math.max(el.clientWidth - gutterWidth, 1);
    }, [gutterWidth]);

    const onSettleRef = useRef(onSettleDelta);
    onSettleRef.current = onSettleDelta;

    const finishScroll = useCallback(() => {
      const el = scrollerRef.current;
      clearTimeout(settleTimer.current);
      if (!el || !settlePending.current) return;
      settlePending.current = false;
      const index = Math.max(
        0,
        Math.min(
          Math.round(el.scrollLeft / panelWidth()),
          pageStarts.length - 1,
        ),
      );
      const delta = index - centerIndex;
      const onSettled = settleCallback.current;
      settleCallback.current = undefined;
      if (delta !== 0) onSettleRef.current(delta);
      onSettled?.();
    }, [centerIndex, pageStarts.length, panelWidth]);

    const finishScrollRef = useRef(finishScroll);
    finishScrollRef.current = finishScroll;
    const scheduleSettle = useCallback(() => {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(
        () => finishScrollRef.current(),
        SUPPORTS_SCROLL_END ? SETTLE_BACKSTOP_MS : SETTLE_IDLE_MS,
      );
    }, []);

    useEffect(() => {
      const el = scrollerRef.current;
      if (!el || !SUPPORTS_SCROLL_END) return;
      const onScrollEnd = () => finishScrollRef.current();
      el.addEventListener("scrollend", onScrollEnd);
      return () => el.removeEventListener("scrollend", onScrollEnd);
    }, []);

    const cancelPendingPulse = () => {
      settleCallback.current = undefined;
    };

    const scrollToIndex = useCallback(
      (index: number, behavior: ScrollBehavior, onSettled?: () => void) => {
        const el = scrollerRef.current;
        if (!el) return;
        const target = index * panelWidth();
        if (Math.abs(el.scrollLeft - target) <= SNAP_EPSILON) {
          settleCallback.current = undefined;
          onSettled?.();
          return;
        }
        settleCallback.current = onSettled;
        el.scrollTo({ left: target, behavior });
      },
      [panelWidth],
    );

    useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex]);

    useLayoutEffect(() => {
      clearTimeout(settleTimer.current);
      scrollToIndex(centerIndex, "auto");
    }, [pageStarts, gutterWidth, centerIndex, scrollToIndex]);

    const lastWidth = useRef(0);
    useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;
      lastWidth.current = el.clientWidth;
      const observer = new ResizeObserver(() => {
        const width = el.clientWidth;
        if (width === lastWidth.current) return;
        lastWidth.current = width;
        scrollToIndex(centerIndex, "auto");
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [centerIndex, scrollToIndex]);

    useEffect(
      () => () => {
        clearTimeout(settleTimer.current);
      },
      [],
    );

    const onScroll = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const left = el.scrollLeft;
      if (left === lastScrollLeft.current) return;
      lastScrollLeft.current = left;
      settlePending.current = true;
      scheduleSettle();
    };

    return (
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onPointerDown={cancelPendingPulse}
        onTouchStart={cancelPendingPulse}
        onWheel={cancelPendingPulse}
        className="flex min-h-0 flex-1 overflow-auto overscroll-x-contain [overflow-anchor:none] scrollbar-hide"
        style={{ scrollSnapType: "x mandatory", scrollPaddingLeft: gutterWidth }}
      >
        {gutter && (
          <div
            className="sticky left-0 z-30 shrink-0 bg-background"
            style={{ flex: `0 0 ${gutterWidth}px`, width: gutterWidth }}
          >
            {gutter}
          </div>
        )}
        {pageStarts.map((start) => (
          <div
            key={start.getTime()}
            className="shrink-0"
            style={{
              flex: `0 0 calc(100% - ${gutterWidth}px)`,
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
            }}
          >
            {renderPage(start)}
          </div>
        ))}
      </div>
    );
  },
);
