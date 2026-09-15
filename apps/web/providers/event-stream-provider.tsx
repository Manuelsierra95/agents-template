"use client"

import type { ReactNode } from "react"
import { useEventStream } from "@/lib/realtime/use-event-stream"

/**
 * Mounts the singleton `useEventStream` for the dashboard tree. Wrapping
 * it in a server-component-friendly provider keeps the EventSource open
 * for every authenticated page without duplicating the hook at each
 * leaf component.
 */
export function EventStreamProvider({ children }: { children: ReactNode }) {
	useEventStream()
	return <>{children}</>
}
