import { type ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getServerSession, getServerMe } from "@/lib/auth/server"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SIDEBAR_COOKIE_NAME } from "@workspace/ui/components/sidebar"

/**
 * Authenticated app shell for `/dashboard/*`.
 *
 * Server-side auth gate: redirects to `/login` if no session exists.
 * The new FF-style sidebar is composed here so its `SidebarProvider`
 * (keyboard shortcut `[`, cookie persistence, mobile breakpoint)
 * lives at the top of the tree and has a single source of truth.
 *
 * The `sidebar_state` cookie is read here so the first client render
 * matches the server markup — without it, the provider would briefly
 * flash the open rail closed (or vice versa) before reading the cookie.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getServerSession()
  if (!session) {
    redirect("/login")
  }
  const me = await getServerMe()
  const cookieStore = await cookies()
  const raw = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value
  const defaultOpen = raw === undefined ? true : raw === "true"

  // The first non-whitespace character of the workspace name becomes the
  // avatar tile in the sidebar header. Falls back to a generic dot for
  // untitled workspaces so the layout never renders an empty avatar.
  const workspaceName = me?.organizationName?.trim() || "Workspace"
  const workspaceLetter = workspaceName.replace(/\s+/g, " ").charAt(0).toUpperCase() || "•"

  return (
    <AppSidebar
      defaultOpen={defaultOpen}
      user={{
        name: session.user.name,
        email: session.user.email,
      }}
      workspace={{
        name: workspaceName,
        letter: workspaceLetter,
      }}
    >
      {children}
    </AppSidebar>
  )
}
