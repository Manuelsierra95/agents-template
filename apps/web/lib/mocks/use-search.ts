"use client";

import { useMemo } from "react";

import type { Attendee } from "./types";
import { useMocks } from "./provider";

export type Contact = {
  email: string;
  displayName?: string;
  /** mock-synced photo URL (always undefined — no remote sync). */
  photoUrl?: string;
};

/** The synced contacts list. Without a backend this is just the union of every
 * attendee email seen across the seed events. */
export function useContacts() {
  const { state } = useMocks();
  return useMemo<Contact[]>(() => {
    const seen = new Map<string, Contact>();
    for (const evt of state.events) {
      if (!evt.attendees) continue;
      for (const a of evt.attendees) {
        if (!a.email || seen.has(a.email.toLowerCase())) continue;
        seen.set(a.email.toLowerCase(), {
          email: a.email,
          displayName: a.displayName,
          photoUrl: a.photoUrl,
        });
      }
    }
    return [...seen.values()].sort((a, b) =>
      (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email),
    );
  }, [state.events]);
}

export type SearchResults = {
  events: { _id: string; summary: string; startMs: number; endMs: number }[];
  people: Contact[];
  /** Quasi-fuzzy match score; not used in UI today but kept for parity. */
};

/** Lightweight full-text search across event titles + attendees. */
export function useSearch(query: string): SearchResults {
  const { state } = useMocks();
  return useMemo<SearchResults>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { events: [], people: [] };

    const matchedEvents = state.events
      .filter((e) => {
        const inTitle = (e.summary ?? "").toLowerCase().includes(q);
        const inDesc = (e.description ?? "").toLowerCase().includes(q);
        const inLoc = (e.location ?? "").toLowerCase().includes(q);
        const inAttendees = (e.attendees ?? []).some((a) =>
          [a.email, a.displayName ?? ""].some((s) => s.toLowerCase().includes(q)),
        );
        return inTitle || inDesc || inLoc || inAttendees;
      })
      .slice(0, 50)
      .map((e) => ({
        _id: e._id,
        summary: e.summary ?? "(No title)",
        startMs: e.startMs,
        endMs: e.endMs,
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const matchedPeople: Contact[] = [];
    const seen = new Set<string>();
    for (const e of state.events) {
      for (const a of e.attendees ?? []) {
        if (seen.has(a.email.toLowerCase())) continue;
        if (
          a.email.toLowerCase().includes(q) ||
          (a.displayName?.toLowerCase().includes(q) ?? false)
        ) {
          matchedPeople.push({
            email: a.email,
            displayName: a.displayName,
            photoUrl: a.photoUrl,
          });
          seen.add(a.email.toLowerCase());
        }
      }
    }

    return { events: matchedEvents, people: matchedPeople };
  }, [query, state.events]);
}
