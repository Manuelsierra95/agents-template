"use client";

import { useCallback } from "react";

import { useSession } from "@/features/auth";
import type {
  CalendarEvent,
  EventCapabilities,
} from "@/lib/calendar/types";

/**
 * Capability gating for a calendar event.
 *
 * The rule is simple: an operator can edit/delete an event they
 * created. Anything else is read-only. The backend trusts this — it
 * doesn't enforce per-user write permissions on the row, only
 * org-scoping on the query — so a UI bug here can leak across users.
 *
 * `useSession` comes from Better Auth's reactive session; the user's
 * `id` here is the real auth subject, not the seed-mock user.
 */
export function useEventCapabilities() {
  const session = useSession();
  const userId =
    session.status === "authenticated" ? session.user.id : null;
  return useCallback(
    (event: CalendarEvent): EventCapabilities => {
      const live = event.status !== "cancelled";
      const mine = userId !== null && event.createdBy === userId;
      return {
        canEdit: live && mine,
        canDelete: mine,
      };
    },
    [userId],
  );
}
