"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { useMocks } from "@/lib/mocks";
import { useListBookings } from "@/lib/mocks/use-bookings";
import { useContacts } from "@/lib/mocks/use-search";

import type { CalendarEvent } from "@/lib/mocks/types";

import { DayColumn } from "./day-column";
import { GutterColumn } from "./gutter-column";
import {
  allDayBandHeight,
  bucketDayEvents,
  dayColsTemplate,
  GUTTER_TOTAL,
  HEADER_DATE_HEIGHT,
  layoutAllDayEvents,
  MIN_DAY_HEIGHT,
  MS_PER_DAY,
  MS_PER_MINUTE,
  SETTLE_BACKSTOP_MS,
  SETTLE_IDLE_MS,
  SNAP_EPSILON,
  SUPPORTS_SCROLL_END,
  TIME_GRID_BOTTOM_SPACER_HEIGHT,
  visibleAllDayMetrics,
} from "./lib";
import {
  getNowIndicatorLayout,
  NowIndicator,
  type NowIndicatorLayout,
} from "./now-indicator";
import { PanelHeader } from "./panel-header";
import type { Reveal } from "./today-pulse";
import { useEventDrag } from "./use-event-drag";

const NO_BOOKINGS: never[] = [];

export interface TimeStripHandle {
  scrollToIndex: (index: number, behavior: ScrollBehavior) => void;
  scrollToColumn: (
    index: number,
    topPct: number | null,
    onSettled: () => void,
  ) => void;
  scrollToTodayColumn: (index: number, onSettled: () => void) => void;
  primeCenterAt: (topPct: number | "now" | null) => void;
  primeCenterNow: () => void;
}

interface TimeStripProps {
  days: Date[];
  anchorIndex: number;
  columns: number;
  events: CalendarEvent[];
  onSettleDeltaDays: (deltaDays: number) => void;
  reveal: Reveal;
  timeZone: string;
}

export const TimeStrip = forwardRef<TimeStripHandle, TimeStripProps>(
  function TimeStrip(
    { days, anchorIndex, columns, events, onSettleDeltaDays, reveal, timeZone },
    ref,
  ) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    );
    const scrollRaf = useRef<number | null>(null);
    const lastScrollLeft = useRef(0);
    const todaySettleCallback = useRef<(() => void) | undefined>(undefined);
    const settlePending = useRef(false);
    const didInitialNowScroll = useRef(false);
    const centerPrimedRef = useRef(false);
    const centerAtPctRef = useRef<number | "now" | null>(null);
    const nowLayoutRef = useRef<NowIndicatorLayout | null>(null);
    const userInteractedRef = useRef(false);
    const [now, setNow] = useState<number | null>(null);
    const [visibleStartIdx, setVisibleStartIdx] = useState(anchorIndex);
    const { state } = useMocks();
    const people = useContacts();
    const contactPhotos = useMemo(() => {
      const photos = new Map<string, string>();
      for (const p of people) {
        if (!p.photoUrl) continue;
        photos.set(p.email.toLowerCase(), p.photoUrl);
      }
      return photos;
    }, [people]);

    // Keep the clock aligned to minute boundaries.
    useEffect(() => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let interval: ReturnType<typeof setInterval> | undefined;
      const clearTimers = () => {
        if (timeout) clearTimeout(timeout);
        if (interval) clearInterval(interval);
      };
      const tick = () => setNow(Date.now());
      const schedule = () => {
        clearTimers();
        timeout = setTimeout(() => {
          tick();
          interval = setInterval(tick, MS_PER_MINUTE);
        }, MS_PER_MINUTE - (Date.now() % MS_PER_MINUTE));
      };
      const refresh = () => {
        tick();
        schedule();
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") refresh();
      };
      schedule();
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        clearTimers();
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }, []);

    const colWidth = useCallback(() => {
      const el = scrollerRef.current;
      if (!el) return 1;
      return Math.max((el.clientWidth - GUTTER_TOTAL) / columns, 1);
    }, [columns]);

    const onSettleRef = useRef(onSettleDeltaDays);
    onSettleRef.current = onSettleDeltaDays;

    const finishScroll = useCallback(() => {
      const el = scrollerRef.current;
      clearTimeout(settleTimer.current);
      if (!el || !settlePending.current) return;
      settlePending.current = false;
      const index = Math.max(
        0,
        Math.min(Math.round(el.scrollLeft / colWidth()), days.length - columns),
      );
      const delta = index - anchorIndex;
      const onSettled = todaySettleCallback.current;
      todaySettleCallback.current = undefined;
      if (delta !== 0) onSettleRef.current(delta);
      onSettled?.();
    }, [anchorIndex, colWidth, columns, days.length]);

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

    const cancelPendingTodayPulse = () => {
      userInteractedRef.current = true;
      todaySettleCallback.current = undefined;
    };

    const scrollToIndex = useCallback(
      (index: number, behavior: ScrollBehavior) => {
        const el = scrollerRef.current;
        if (!el) return;
        todaySettleCallback.current = undefined;
        const target = index * colWidth();
        if (behavior === "auto") setVisibleStartIdx(index);
        if (Math.abs(el.scrollLeft - target) <= SNAP_EPSILON) return;
        el.scrollTo({ left: target, behavior });
      },
      [colWidth],
    );

    const scrollTopForPct = useCallback((pct: number | null) => {
      const el = scrollerRef.current;
      const body = bodyRef.current;
      if (!el) return 0;
      if (pct == null || !body) return el.scrollTop;
      return Math.max(
        0,
        body.offsetTop +
          body.clientHeight * (pct / 100) -
          el.clientHeight * 0.35,
      );
    }, []);

    const nowPct = useCallback(() => {
      const layout = nowLayoutRef.current;
      return layout?.today ? layout.topPct : null;
    }, []);

    const scrollToColumn = useCallback(
      (index: number, topPct: number | null, onSettled: () => void) => {
        const el = scrollerRef.current;
        if (!el) return;
        didInitialNowScroll.current = true;
        const left = index * colWidth();
        const top = scrollTopForPct(topPct);
        if (
          Math.abs(el.scrollLeft - left) <= SNAP_EPSILON &&
          Math.abs(el.scrollTop - top) <= SNAP_EPSILON
        ) {
          todaySettleCallback.current = undefined;
          onSettled();
          return;
        }
        todaySettleCallback.current = onSettled;
        settlePending.current = true;
        scheduleSettle();
        el.scrollTo({ left, top, behavior: "smooth" });
      },
      [colWidth, scrollTopForPct, scheduleSettle],
    );

    const scrollToTodayColumn = useCallback(
      (index: number, onSettled: () => void) =>
        scrollToColumn(index, nowPct(), onSettled),
      [scrollToColumn, nowPct],
    );

    const primeCenterAt = useCallback((topPct: number | "now" | null) => {
      clearTimeout(settleTimer.current);
      todaySettleCallback.current = undefined;
      centerPrimedRef.current = true;
      centerAtPctRef.current = topPct;
    }, []);

    const primeCenterNow = useCallback(() => primeCenterAt("now"), [primeCenterAt]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex,
        scrollToColumn,
        scrollToTodayColumn,
        primeCenterAt,
        primeCenterNow,
      }),
      [scrollToIndex, scrollToColumn, scrollToTodayColumn, primeCenterAt, primeCenterNow],
    );

    useLayoutEffect(() => {
      const el = scrollerRef.current;
      clearTimeout(settleTimer.current);
      let raf = 0;
      if (el) {
        el.setAttribute("data-recenter", "");
        raf = requestAnimationFrame(() => el.removeAttribute("data-recenter"));
      }
      if (centerPrimedRef.current && el) {
        const primed = centerAtPctRef.current;
        centerPrimedRef.current = false;
        centerAtPctRef.current = null;
        setVisibleStartIdx(anchorIndex);
        didInitialNowScroll.current = true;
        const pct = primed === "now" ? nowPct() : primed;
        el.scrollTo({
          left: anchorIndex * colWidth(),
          top: scrollTopForPct(pct),
          behavior: "auto",
        });
        return () => cancelAnimationFrame(raf);
      }
      scrollToIndex(anchorIndex, "auto");
      return () => cancelAnimationFrame(raf);
    }, [days, anchorIndex, scrollToIndex, colWidth, scrollTopForPct, nowPct]);

    const lastWidth = useRef(0);
    useEffect(() => {
      const el = scrollerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      lastWidth.current = el.clientWidth;
      const observer = new ResizeObserver(() => {
        const width = el.clientWidth;
        if (width === lastWidth.current) return;
        lastWidth.current = width;
        scrollToIndex(anchorIndex, "auto");
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [anchorIndex, scrollToIndex]);

    useEffect(
      () => () => {
        clearTimeout(settleTimer.current);
        if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
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
      if (scrollRaf.current !== null) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null;
        const current = scrollerRef.current;
        if (!current) return;
        const index = Math.max(
          0,
          Math.min(
            Math.round(current.scrollLeft / colWidth()),
            days.length - columns,
          ),
        );
        setVisibleStartIdx((prev) => (prev === index ? prev : index));
      });
    };

    const { effectiveEvents, beginDrag, draggingId } = useEventDrag(
      events,
      days,
      timeZone,
    );

    const { allDayEvents, timedByDay } = useMemo(
      () => bucketDayEvents(days, effectiveEvents),
      [days, effectiveEvents],
    );

    const pendingBookings = useListBookings();
    const bookings = useMemo(() => {
      return pendingBookings.filter((b) => b.status === "pending" && (now == null || b.endMs > now));
    }, [pendingBookings, now]);

    const bookingsByDay = useMemo(() => {
      const buckets: typeof bookings[] = days.map(() => []);
      for (const booking of bookings) {
        days.forEach((day, i) => {
          const dayStartMs = day.getTime();
          if (
            booking.startMs < dayStartMs + MS_PER_DAY &&
            booking.endMs > dayStartMs
          ) {
            const target = buckets[i];
            if (target) target.push(booking);
          }
        });
      }
      return buckets;
    }, [days, bookings]);

    const maxStartIdx = Math.max(0, days.length - columns);
    const startIdx = Math.min(Math.max(visibleStartIdx, 0), maxStartIdx);
    const visibleEndIdx = Math.min(startIdx + columns - 1, days.length - 1);
    const allDayLayout = useMemo(
      () => layoutAllDayEvents(days, allDayEvents, startIdx, visibleEndIdx),
      [days, allDayEvents, startIdx, visibleEndIdx],
    );
    const visibleRangeKey = `${days[startIdx]?.getTime() ?? 0}:${columns}`;
    const [expandedAllDayRange, setExpandedAllDayRange] = useState<string>();
    const allDayExpanded = expandedAllDayRange === visibleRangeKey;
    const { laneCount: visibleAllDayLaneCount, hiddenEventCount } = useMemo(
      () => visibleAllDayMetrics(allDayLayout, startIdx, visibleEndIdx),
      [allDayLayout, startIdx, visibleEndIdx],
    );
    const allDayHeight = allDayBandHeight(
      visibleAllDayLaneCount,
      allDayExpanded,
    );
    const nowLayout = now == null ? null : getNowIndicatorLayout(days, now, timeZone);
    nowLayoutRef.current = nowLayout;

    const parkedZoneRef = useRef(timeZone);
    useLayoutEffect(() => {
      if (parkedZoneRef.current === timeZone) return;
      parkedZoneRef.current = timeZone;
      didInitialNowScroll.current = false;
    }, [timeZone]);

    useLayoutEffect(() => {
      if (didInitialNowScroll.current || !nowLayout?.today) return;
      if (userInteractedRef.current) {
        didInitialNowScroll.current = true;
        return;
      }
      const scroller = scrollerRef.current;
      const body = bodyRef.current;
      if (!scroller || !body) return;

      const indicatorTop =
        body.offsetTop + body.clientHeight * (nowLayout.topPct / 100);
      scroller.scrollTo({
        left: scroller.scrollLeft,
        top: Math.max(0, indicatorTop - scroller.clientHeight * 0.35),
        behavior: "auto",
      });
      didInitialNowScroll.current = true;
    }, [nowLayout]);

    return (
      <div
        data-time-strip-scroller
        ref={scrollerRef}
        onScroll={onScroll}
        onPointerDown={cancelPendingTodayPulse}
        onTouchStart={cancelPendingTodayPulse}
        onWheel={cancelPendingTodayPulse}
        className="group/strip flex min-h-0 flex-1 overflow-auto overscroll-x-contain bg-background [overflow-anchor:none] scrollbar-hide"
        style={{
          scrollSnapType: "x mandatory",
          scrollPaddingLeft: GUTTER_TOTAL,
          backgroundImage:
            "linear-gradient(to bottom, var(--calendar-header) 0%, var(--calendar-header) 50%, var(--background) 50%)",
        }}
      >
        <div
          className="sticky left-0 z-30 h-max min-h-full shrink-0 overflow-x-clip bg-background"
          style={{ flex: `0 0 ${GUTTER_TOTAL}px`, width: GUTTER_TOTAL }}
        >
          <GutterColumn
            allDayHeight={allDayHeight}
            allDayExpanded={allDayExpanded}
            hiddenAllDayEventCount={hiddenEventCount}
            onToggleAllDay={() =>
              setExpandedAllDayRange(allDayExpanded ? undefined : visibleRangeKey)
            }
            now={now ?? Date.now()}
          />
        </div>
        <div
          className="flex h-max min-h-full shrink-0 flex-col"
          style={{
            flex: `0 0 calc(${days.length} * (100% - ${GUTTER_TOTAL}px) / ${columns})`,
          }}
        >
          <div className="sticky top-0 z-30 shrink-0">
            <PanelHeader
              days={days}
              allDayEvents={allDayLayout}
              allDayHeight={allDayHeight}
              allDayExpanded={allDayExpanded}
              reveal={reveal}
            />
          </div>
          <div
            data-time-grid
            ref={bodyRef}
            className="relative grid flex-1 bg-background"
            style={
              {
                "--calendar-header-height": `${HEADER_DATE_HEIGHT + allDayHeight}px`,
                gridTemplateColumns: dayColsTemplate(days.length),
                gridTemplateRows: "minmax(0, 1fr)",
                minHeight: MIN_DAY_HEIGHT,
                backgroundImage:
                  "linear-gradient(to bottom, color-mix(in oklab, var(--border) 55%, transparent) 0 1px, transparent 1px)",
                backgroundSize: "100% calc(100% / 24)",
              } as CSSProperties
            }
          >
            {days.map((day, i) => (
              <DayColumn
                key={day.getTime()}
                day={day}
                events={timedByDay[i] ?? []}
                gridRef={bodyRef}
                beginDrag={beginDrag}
                draggingId={draggingId}
                laneLayout={columns === 1}
                contactPhotos={contactPhotos}
                bookings={bookingsByDay[i] ?? []}
                reveal={reveal}
              />
            ))}
            {nowLayout && <NowIndicator layout={nowLayout} />}
          </div>
          <div
            aria-hidden
            className="grid shrink-0 bg-background"
            style={{
              gridTemplateColumns: dayColsTemplate(days.length),
              height: TIME_GRID_BOTTOM_SPACER_HEIGHT,
              maskImage: "linear-gradient(to bottom, black, transparent)",
            }}
          >
            {days.map((day) => (
              <div key={day.getTime()} className="border-l border-border" />
            ))}
          </div>
        </div>
      </div>
    );
  },
);
