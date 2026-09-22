"use client"

/**
 * `usePendingMoves` — debounced batch queue for drag-to-move events.
 *
 * Why batching?
 * -------------
 * The dashboard's drag flow lets an operator rearrange many events in
 * quick succession. Per-event HTTP round-trips would:
 *
 *   - spam the API with one request per drop (network + Postgres cost).
 *   - publish N realtime events for N drops (SSE consumers do N
 *     invalidations).
 *   - leave the UI waiting on a round-trip per card.
 *
 * `usePendingMoves` queues the moves and flushes them as a single
 * batch through `batchMoveEventsAction`. The flush is triggered:
 *
 *   - on a debounce window (`debounceMs`, default 500ms) after the last
 *     `enqueue` — so a rapid burst of drags collapses to one batch.
 *   - on `flush()` being called explicitly (visibilitychange, blur,
 *     beforeunload).
 *
 * The React Query cache is the optimistic surface: callers `applyToCache`
 * on the `useQueryClient` to patch every cached range immediately, so
 * the card moves on the screen before the round-trip completes.
 *
 * On success, the server returns the persisted rows; the caller
 * reconciles by re-applying those to the cache (in case any optimistic
 * patch raced with a row the server rejected).
 *
 * On error, the caller rolls back the cache to its pre-batch snapshot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { batchMoveEventsAction } from "@/features/calendar/actions/calendar-events"
import type { BatchMoveEntry } from "@workspace/contracts/calendar"

const DEFAULT_DEBOUNCE_MS = 500

export type FlushOutcome =
  | { ok: true; events: { id: string; startMs: number; endMs: number }[] }
  | { ok: false; error: unknown }

export interface UsePendingMoves {
  /** Number of moves still queued and not yet flushed. */
  pendingCount: number
  /** Add a move to the queue and reset the debounce timer. */
  enqueue: (move: BatchMoveEntry) => void
  /**
   * Drop-in for the mock's `moveEvent(id, startMs, endMs)` — the
   * drag hook used to call `moveEvent(id, startMs, endMs)` straight on
   * the mock store; now it lands in the batch queue instead. Kept
   * shape-compatible so the drag code doesn't need to know about the
   * pending store.
   */
  moveEvent: (id: string, startMs: number, endMs: number) => void
  /**
   * Add many moves in one go (e.g. when reconciling server data). Same
   * scheduling rules as `enqueue` — the flush timer is reset.
   */
  enqueueMany: (moves: BatchMoveEntry[]) => void
  /** Force an immediate flush. Resolves with the server's outcome. */
  flush: () => Promise<FlushOutcome>
  /** True between the first enqueue and the next successful flush. */
  isFlushing: boolean
}

export function usePendingMoves(options?: {
  debounceMs?: number
}): UsePendingMoves {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS

  // The queue is held in a ref so enqueue/flush from any render commit
  // see the same snapshot. We only put a tiny `pendingCount` in state
  // so consumers can render a spinner / disabled UI while flushing.
  const queueRef = useRef<Map<string, BatchMoveEntry>>(new Map())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [isFlushing, setIsFlushing] = useState(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      void flushInternal()
    }, debounceMs)
  }, [clearTimer, debounceMs])

  // The actual flush body — shared between the debounce timer and the
  // imperative `flush()` call. Reads the queue atomically and clears it
  // before awaiting, so re-entrant enqueues during the await go into a
  // fresh queue and schedule their own flush.
  const flushInternal = useCallback(async (): Promise<FlushOutcome> => {
    clearTimer()
    const snapshot = [...queueRef.current.values()]
    if (snapshot.length === 0) {
      setPendingCount(0)
      return { ok: true, events: [] }
    }
    queueRef.current = new Map()
    setPendingCount(0)
    setIsFlushing(true)
    try {
      const res = await batchMoveEventsAction(snapshot)
      return { ok: true, events: res.events }
    } catch (err) {
      return { ok: false, error: err }
    } finally {
      setIsFlushing(false)
    }
  }, [clearTimer])

  const enqueue = useCallback(
    (move: BatchMoveEntry) => {
      // Last write wins — a card dragged twice in the same burst is
      // recorded once, with the final target time.
      queueRef.current.set(move.id, move)
      setPendingCount(queueRef.current.size)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  // Same shape as the mock's `moveEvent(id, startMs, endMs)` so the
  // drag hook can keep its three-arg call site.
  const moveEvent = useCallback(
    (id: string, startMs: number, endMs: number) => {
      enqueue({ id, startMs, endMs })
    },
    [enqueue],
  )

  const enqueueMany = useCallback(
    (moves: BatchMoveEntry[]) => {
      if (moves.length === 0) return
      for (const move of moves) {
        queueRef.current.set(move.id, move)
      }
      setPendingCount(queueRef.current.size)
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const flush = useCallback((): Promise<FlushOutcome> => flushInternal(), [
    flushInternal,
  ])

  // Flush on tab hide / page unload so a half-typed burst still lands.
  // `beforeunload` is a best-effort — modern browsers ignore async work
  // in the unload handler — but the `pagehide` + `visibilitychange`
  // pair covers most cases. The Server Action is fire-and-forget here;
  // we don't await because the page is going away.
  useEffect(() => {
    const onHide = () => {
      if (queueRef.current.size === 0) return
      const snapshot = [...queueRef.current.values()]
      queueRef.current = new Map()
      setPendingCount(0)
      void batchMoveEventsAction(snapshot).catch(() => {
        /* swallow — best-effort flush */
      })
    }
    const onBeforeUnload = () => {
      onHide()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onHide)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onHide)
      window.removeEventListener("beforeunload", onBeforeUnload)
      clearTimer()
    }
  }, [clearTimer])

  return useMemo(
    () => ({ pendingCount, enqueue, moveEvent, enqueueMany, flush, isFlushing }),
    [pendingCount, enqueue, moveEvent, enqueueMany, flush, isFlushing],
  )
}
