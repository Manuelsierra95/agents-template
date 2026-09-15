/**
 * Centralised navigation registry.
 *
 * Single source of truth for the small set of auth-gated routes the
 * dashboard exposes today: Dashboard (welcome), Calendar and Agents.
 * The nav model was trimmed from the original product spec — only the
 * sections with real routes remain. Additional keys are commented in
 * `src/components/layout/app-sidebar.tsx` to make the additions easy
 * when those routes ship.
 */

/** Stable identifiers for the dashboard navigation rows. */
export type AppNavKey = "dashboard" | "calendar" | "chat" | "agents"

/** Map a key to its dashboard-anchored href. */
export function hrefForNavKey(key: AppNavKey): string {
  switch (key) {
    case "dashboard":
      return "/dashboard"
    case "calendar":
      return "/dashboard/calendar"
    case "chat":
      return "/dashboard/chat"
    case "agents":
      return "/dashboard/agents"
  }
}

/**
 * Resolve the active `AppNavKey` for a given URL pathname.
 *
 * Defaults to `"dashboard"` for unknown paths so a 404 in the
 * `dashboard/*` tree still highlights the root row.
 */
export function navKeyFromPathname(pathname: string): AppNavKey | null {
  // Strip query and hash defensively — `usePathname()` shouldn't
  // include them, but extra hygiene is cheap.
  const cleanPath = pathname.split(/[?#]/)[0] ?? ""

  if (cleanPath === "/dashboard" || cleanPath === "/dashboard/") {
    return "dashboard"
  }
  if (cleanPath.startsWith("/dashboard/calendar")) {
    return "calendar"
  }
  if (cleanPath.startsWith("/dashboard/chat")) {
    return "chat"
  }
  if (cleanPath.startsWith("/dashboard/agents")) {
    return "agents"
  }
  return null
}
