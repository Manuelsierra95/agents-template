"use client"

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import { useTheme } from "next-themes"

import {
  DropdownContent,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  MenuItem,
  ScrollArea,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  SizeProvider,
  Tooltip,
  useIcon,
} from "@workspace/ui/components/sidebar"

import {
  hrefForNavKey,
  navKeyFromPathname,
  type AppNavKey,
} from "@/lib/navigation"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"

// SSR-safe layout effect: server falls back to useEffect (no warning), client
// uses useLayoutEffect so the post-mount swap lands before the first paint
// and the user never sees the wrong theme icon (or an empty placeholder).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

// ---------------------------------------------------------------------------
// Sidebar-anchored menus: trigger width +10px, shifted -4px — items start at
// the trigger row's edge, icon slots land on the rows' leading axis, and the
// trailing check sits on the trigger chevron's axis.
// ---------------------------------------------------------------------------
const SIDEBAR_MENU_POPUP =
  "min-w-[240px] -ml-1 w-[calc(var(--radix-dropdown-menu-trigger-width,var(--anchor-width))_+_10px)] [&_[role=menuitem]]:pl-2 [&_[role=menuitem]]:pr-1.5 [&_[role=menuitem]]:gap-2 [&_[role=menuitemradio]]:pl-2 [&_[role=menuitemradio]]:pr-1.5 [&_[role=menuitemradio]]:gap-2"

// Tooltip label + keystroke chip — matches the sidebar internals' shortcut row.
// Currently unused (PeekAwareHeader is minimal) but kept here so fase 2
// can re-wire it without re-deriving the markup from `git log`.
function tipWithShortcut(label: string, shortcut: string) {
  return (
    <span className="flex items-center gap-2">
      <span className="[text-box:trim-both_cap_alphabetic]">{label}</span>
      <kbd className="-my-1 flex h-4 min-w-4 items-center justify-center rounded border border-background/30 px-1 font-sans text-[10px] text-background/80">
        {shortcut}
      </kbd>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Nav model — driven by navigation.ts. Platform = app sections (icons in the
// leading axis), Workspace = operator-only entries.
// ---------------------------------------------------------------------------

import type { IconName } from "@workspace/ui/components/sidebar"

type NavChild = {
  label: string
  href: string
  iconName: IconName
  badge?: string
}

type NavItem = {
  key: AppNavKey
  label: string
  href: string
  iconName: IconName
  /** Optional badge rendered next to the row label. */
  badge?: string
  /** When present, the row becomes a parent that toggles a sub-menu. */
  children?: { open: boolean; items: NavChild[] }
}

const PLATFORM_ITEMS: NavItem[] = [
  // TODO(fase 2): reintroducir rows adicionales (Conversations,
  // Appointments, Customers, Playground) cuando existan sus rutas.
  // Por ahora solo Calendar y Chat tienen página detrás, así que
  // mantenemos el sidebar mínimo para que el flujo de navegación sea
  // explícito.
  {
    key: "calendar",
    label: "Calendar",
    href: hrefForNavKey("calendar"),
    iconName: "calendar",
  },
  {
    key: "chat",
    label: "Chat",
    href: hrefForNavKey("chat"),
    iconName: "message-circle",
  },
]

const WORKSPACE_ITEMS: NavItem[] = [
  {
    key: "agents",
    label: "Agents",
    href: hrefForNavKey("agents"),
    iconName: "brain",
  },
]

// ---------------------------------------------------------------------------
// Workspace switcher (header) — renders the active organization as a
// dropdown trigger at the top of the rail. Switching workspaces is a
// Better Auth `setActiveOrganization` call, so when the project adds a
// multi-workspace UI the menu items below can wire straight to
// `authClient.organization.setActive({ organizationId })`.
//
// For now the dropdown shows the current workspace checked and a
// disabled "New workspace" placeholder, mirroring the original
// product spec but without surfacing a half-implemented modal.
// ---------------------------------------------------------------------------
function WorkspaceSwitcher({
  workspace,
}: {
  workspace: { name: string; letter: string }
}) {
  const ChevronDown = useIcon("chevron-down")
  const PlusIcon = useIcon("plus")
  const AcmeTile = useIcon("square-library")

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <SidebarMenuButton aria-label="Switch workspace" className="pl-8">
            {/* 20px tile at left-1.5 — centred on the rows' 16px leading axis */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md bg-foreground text-[10px] text-background"
            >
              {workspace.letter}
            </span>
            <span className="min-w-0 truncate text-[13px] text-foreground">
              {workspace.name}
            </span>
            <span className="ml-auto inline-flex @max-[7rem]:hidden">
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownContent
        className={SIDEBAR_MENU_POPUP}
        align="start"
        sideOffset={4}
      >
        <MenuItem
          index={0}
          icon={AcmeTile}
          label={workspace.name}
          checked
          onSelect={() => {}}
        />
        <MenuItem
          index={1}
          icon={PlusIcon}
          label="New workspace"
          // TODO(fase 2): abrir el modal de creación de workspace cuando
          // el modelo multi-workspace esté listo. Por ahora no hace nada.
          onSelect={() => {}}
        />
      </DropdownContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Sidebar header row: workspace switcher, search, and sidebar toggle all share
// the same compact 24px icon slot. The toggle lives INSIDE the sidebar at the
// right of search — always visible (the sidebar itself reveals the row when
// expanded or peeked), so the workspace tile no longer cross-fades with it.
// ---------------------------------------------------------------------------
function PeekAwareHeader({
  workspace,
}: {
  workspace: { name: string; letter: string }
}) {
  const SearchIcon = useIcon("search")

  return (
    <div className="flex items-center gap-1 pr-1.5">
      <SidebarMenu aria-label="Workspace" className="@container min-w-0 flex-1">
        <SidebarMenuItem>
          <WorkspaceSwitcher workspace={workspace} />
        </SidebarMenuItem>
      </SidebarMenu>
      {/*
        TODO(fase 2): abrir command palette cuando exista el feature
        search. Por ahora el botón no hace nada — sólo muestra el icono.
      */}
      <Tooltip content={tipWithShortcut("Search", "⌘K")} side="bottom">
        <button
          type="button"
          aria-label="Search"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        >
          <SearchIcon size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <SidebarTrigger
        size="icon-compact"
        className="size-6 shrink-0"
        aria-label="Toggle Sidebar"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nav rows — parent rows cross-fade a chevron (rotated 90° while open) and
// reserve the trailing slot so the open/closed glyph does not slide.
// ---------------------------------------------------------------------------
function ChevronToggle({ open }: { open: boolean }) {
  const ChevronRight = useIcon("chevron-right")

  return (
    <span className="ml-auto -mr-0.5 flex size-6 shrink-0 items-center justify-center">
      <motion.span
        className="inline-flex"
        animate={{ rotate: open ? 90 : 0 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
      >
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          className={`text-muted-foreground transition-opacity duration-80 ${open
            ? "opacity-0 group-hover/parent-row:opacity-100 group-focus-within/parent-row:opacity-100"
            : "opacity-100"}`}
        />
      </motion.span>
    </span>
  )
}

function MoreAction() {
  // TODO(fase 2): reintroducir el dropdown "Rename / Share" cuando
  // existan las acciones de gestión de recursos. Por ahora no se usa
  // porque todos los rows son hojas sin permisos extra; queda aquí solo
  // como placeholder para evitar la rama `!hasChildren ? <MoreAction />`
  // de NavRow mientras reintroducimos secciones padre.
  return null
}

function NavRow({ item }: { item: NavItem }) {
  const pathname = usePathname() ?? ""
  const [open, setOpen] = useState(item.children?.open ?? false)
  const hasChildren = Boolean(item.children)
  const active =
    navKeyFromPathname(pathname) === item.key &&
    (!hasChildren || pathname === item.href)
  const Icon = useIcon(item.iconName)
  const rowGutter = hasChildren
    ? { ["--row-gutter" as string]: "var(--row-gutter-hover)" }
    : undefined

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        icon={Icon}
        render={
          hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              className="group/parent-row"
              style={rowGutter as CSSProperties}
              onClick={() => setOpen((value) => !value)}
            />
          ) : (
            <Link href={item.href} />
          )
        }
      >
        {item.label}
        {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
        {hasChildren ? <ChevronToggle open={open} /> : null}
      </SidebarMenuButton>
      {!hasChildren ? <MoreAction /> : null}
      {hasChildren && item.children ? (
        <SidebarMenuSub open={open}>
          {item.children.items.map((child) => (
            <SubRow key={child.label} child={child} active={pathname === child.href} />
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
}

function SubRow({ child, active }: { child: NavChild; active: boolean }) {
  const Icon = useIcon(child.iconName)
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        isActive={active}
        icon={Icon}
        render={<Link href={child.href} />}
      >
        {child.label}
      </SidebarMenuSubButton>
      {child.badge ? <SidebarMenuBadge>{child.badge}</SidebarMenuBadge> : null}
    </SidebarMenuSubItem>
  )
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavRow key={item.key} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

// ---------------------------------------------------------------------------
// Footer callouts — a sonner-style pile: front card on top, two peeks behind.
// TODO(fase 2): reintroducir la pila de callouts cuando el dominio del
// producto (agent live, whatsapp, calendar sync) esté activo. El stub
// original dependía de `lib/brand-mesh.ts` y `Card`/`CardImage` del
// design-system; ambos siguen disponibles pero el contenido sería 100%
// marketing con datos que aún no tenemos.
// ---------------------------------------------------------------------------
//
// type Callout = { id: string; title: string; desc: string; intensity: number }
// const INITIAL_CALLOUTS: Callout[] = [ … ]
// function FooterCallouts() { … }

function FooterCallouts() {
  // Placeholder no-op. Reemplazar por la versión comentada arriba.
  return null
}

// ---------------------------------------------------------------------------
// User menu — same popup geometry as the workspace switcher, opening upward
// because the footer is at the bottom of the rail.
// ---------------------------------------------------------------------------
function UserMenu({ name, email }: { name: string; email: string }) {
  const ChevronsUpDown = useIcon("chevrons-up-down")
  const UserIcon = useIcon("user")
  const SettingsIcon = useIcon("settings")
  const LogOutIcon = useIcon("log-out")
  const router = useRouter()

  async function onSignOut() {
    await authClient.signOut()
    router.replace("/login")
  }

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <SidebarMenuButton aria-label="Open user menu">
            {/* -ml-0.5 centres the 20px avatar on the rows' leading icon axis;
                the chevron rides a 24px slot pulled -mr-0.5 onto the trailing
                action axis */}
            <span
              aria-hidden
              className="-ml-0.5 -mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] text-background"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate text-[13px] text-foreground">
              {name}
            </span>
            <span className="ml-auto -mr-0.5 flex size-6 shrink-0 items-center justify-center">
              <ChevronsUpDown
                size={16}
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownContent
        className={SIDEBAR_MENU_POPUP}
        side="top"
        align="start"
        sideOffset={6}
      >
        <DropdownLabel>{email || name}</DropdownLabel>
        <MenuItem
          index={0}
          icon={UserIcon}
          label="Profile"
          onSelect={() => {}}
        />
        <MenuItem
          index={1}
          icon={SettingsIcon}
          label="Settings"
          onSelect={() => {}}
        />
        <DropdownSeparator />
        <MenuItem
          index={2}
          icon={LogOutIcon}
          label="Cerrar sesión"
          onSelect={onSignOut}
        />
      </DropdownContent>
    </DropdownMenu>
  )
}

function FooterActions({ user }: { user: { name: string; email: string } }) {
  // TODO(fase 2): reintroducir el botón de Settings (sin página hoy).
  // const SettingsIcon = useIcon("settings")
  const MoonIcon = useIcon("moon")
  const SunIcon = useIcon("sun")
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // The server can't read the user's theme (no localStorage / system pref at
  // SSR time), so it would always guess wrong. We render NO theme-dependent
  // UI until mounted — then useLayoutEffect commits the resolved theme
  // synchronously before the first paint, so neither a hydration mismatch nor
  // a Moon→Sun flash is ever visible.
  useIsoLayoutEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const toggleTheme = () => {
    if (!mounted) return
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <div className="flex items-center gap-1 pr-1.5">
      <SidebarMenu aria-label="User" className="min-w-0 flex-1">
        <SidebarMenuItem>
          <UserMenu name={user.name} email={user.email} />
        </SidebarMenuItem>
      </SidebarMenu>
      {/*
        TODO(fase 2): reintroducir botón de Settings.
        <Tooltip content="Settings" side="top">
          <Button variant="ghost" size="icon-compact" className="size-6 shrink-0" aria-label="Settings">
            <SettingsIcon size={16} strokeWidth={1.5} />
          </Button>
        </Tooltip>
      */}
      <Tooltip content={isDark ? "Light mode" : "Dark mode"} side="top">
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {mounted ? (
            isDark ? (
              <SunIcon size={16} strokeWidth={1.5} />
            ) : (
              <MoonIcon size={16} strokeWidth={1.5} />
            )
          ) : (
            <span aria-hidden className="size-3.5" />
          )}
        </button>
      </Tooltip>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppSidebar — composed once at the layout level. Wraps the rail and the
// inset (the latter renders the route's children) so child pages live inside
// <main>, not next to the chrome.
// ---------------------------------------------------------------------------
export function AppSidebar({
  user,
  workspace,
  defaultOpen = true,
  children,
}: {
  user: { name: string; email: string }
  /**
   * Active workspace — first character becomes the avatar tile in the
   * header switcher. Comes from `getServerMe()` in the dashboard layout.
   */
  workspace: { name: string; letter: string }
  /** Hydrated from the `sidebar_state` cookie by the dashboard layout so the
   *  server-rendered markup matches the first client render. */
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} peek="hover">
      <SizeProvider defaultSize="compact">
        <Sidebar variant="inset">
          <SidebarHeader>
            <PeekAwareHeader workspace={workspace} />
          </SidebarHeader>
          <SidebarContent>
            <NavGroup label="Platform" items={PLATFORM_ITEMS} />
            <NavGroup label="Workspace" items={WORKSPACE_ITEMS} />
          </SidebarContent>
          <SidebarFooter>
            <FooterCallouts />
            <FooterActions user={user} />
          </SidebarFooter>
        </Sidebar>
      </SizeProvider>
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

// Re-export the sidebar primitives used by route pages that want to render a
// tailored empty state inside the inset (e.g. a centered <WorkspacePane>).
export {
  SidebarInset,
  ScrollArea,
}
