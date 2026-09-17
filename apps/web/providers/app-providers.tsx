"use client"

import { type ReactNode } from "react"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { MotionConfig } from "motion/react"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/providers/query-provider"
import { AuthSessionProvider } from "@/features/auth"
import { EventStreamProvider } from "@/providers/event-stream-provider"
import { ShapeProvider } from "@workspace/ui/components/sidebar"

/**
 * `AppProviders` — composition root for every top-level provider.
 *
 * Order: MotionConfig → NuqsAdapter → ShapeProvider → ThemeProvider →
 * QueryProvider → AuthSessionProvider → EventStreamProvider → Toaster.
 *
 * - `MotionConfig reducedMotion="user"` honors the OS reduced-motion
 *   preference for every fluid animation in the tree. Per-component
 *   `useReducedMotion()` still works inside (fluid-hover already does).
 * - `NuqsAdapter` mounts the nuqs URL-state store around the whole tree
 *   so the Conversations list and any future URL-bound UI reads from a
 *   single shared source of truth.
 * - `ShapeProvider` publishes the pill/rounded variant globally so popups
 *   and chrome read the active shape without per-component prop drilling.
 *   Toaster is rendered as a sibling (it doesn't wrap the tree).
 * - `EventStreamProvider` mounts a single `EventSource` and dispatches
 *   SSE events into React Query (invalidation by conversation id /
 *   global). One connection per browser tab; EventSource handles
 *   reconnects.
 *
 * `AuthSessionProvider` is imported directly from the feature barrel.
 */
export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<NuqsAdapter>
			<MotionConfig reducedMotion="user">
				<ShapeProvider defaultShape="rounded">
					<ThemeProvider>
						<QueryProvider>
							<AuthSessionProvider>
								<EventStreamProvider>
									{children}
								</EventStreamProvider>
							</AuthSessionProvider>
						</QueryProvider>
						<Toaster richColors position="top-right" />
					</ThemeProvider>
				</ShapeProvider>
			</MotionConfig>
		</NuqsAdapter>
	)
}