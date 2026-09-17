"use client";

import { useState } from "react";
import { toast } from "sonner";

/** Manual "sync now". In the demo build this is just a no-op — calendars are
 * already in-memory. The hook keeps its in-flight flag and toast surface so
 * any caller can keep using it identically. */
export function useSyncNow() {
  const [isSyncing, setIsSyncing] = useState(false);

  const sync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // No backend in this demo — pretend it ran.
    } catch (error: unknown) {
      toast.error("Couldn't sync calendar", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return { sync, isSyncing };
}
