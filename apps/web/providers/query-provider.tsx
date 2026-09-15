"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { createQueryClient } from "@/lib/query/client"

/**
 * `QueryProvider` — TanStack Query client provider.
 *
 * `useState(() => createQueryClient())` ensures the client is created
 * exactly once per component tree (so cache state survives re-renders
 * but does not leak between server requests).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}