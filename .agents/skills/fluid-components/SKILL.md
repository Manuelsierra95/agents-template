---
name: fluid-components
description: Use Fluid Functionalism (@fluid) shadcn registry components whenever building UI in this monorepo. Triggers on any UI work, page, feature, component, or styling task. Mandates consuming components from @workspace/ui (Base UI flavor installed) instead of writing raw primitives or pulling other UI libraries.
---

# Fluid Functionalism components

All UI in this monorepo is built with components from the **Fluid Functionalism** shadcn registry (`@fluid`). They are the project's design system: spring-based motion, fluid hover, surfaces, sizes, shape, scrollbars, and an icon slot system with Lucide defaults.

Source: <https://www.fluidfunctionalism.com/docs>

## When this skill applies

Apply this skill to **every UI task**, including:

- Building a new page, layout, route, or screen.
- Adding a button, dialog, dropdown, input, card, table, sidebar, tabs, etc.
- Restyling, refactoring, or reviewing an existing component.
- Choosing a primitive (Base UI vs. Radix), a popover, a tooltip, a toast, or a navigation pattern.
- Picking motion / animation / size / surface tokens.

If a UI surface is being touched, fluid components are the default. Reach for raw HTML or other libraries only when no fluid component exists (rare — the registry has 25+ components and 5 system primitives).

## System files (read on demand)

The Fluid Functionalism registry ships **system primitives** alongside its components. Each has its own reference page in the official docs, and each has its own file in this skill. Read the relevant one when the task is about that system, not a one-off component:

- [Fluid Hover](./fluid-hover.md) — `useFluidHover` + `FluidHoverHighlight`. One highlight, no blinking, shared by every list, menu, strip, and grid.
- [Motion](./motion.md) — `spring.fast` / `spring.moderate` / `spring.slow`. One rule for exits (a tier faster than entrances), `MotionConfig` for reduced motion.
- [Scrollbars](./scrollbars.md) — `ScrollArea` on Base UI + `scroll-fade` / `scroll-fade-x` utility for edge fade. Native overflow on touch.
- [Sizes](./sizes.md) — `SizeProvider` + `useSize` + `useTypeScale`. Two steps (36 / 28), region decision, not per-control.
- [Surfaces](./surfaces.md) — `surfaceClasses` + `surfaceHoverClasses` + `Elevated` + `useSurface`. Eight-level ladder that nests via context.

## Installed components

All components live in `packages/ui/src/components/` and are imported from `@workspace/ui/...`. Re-exports for shell work are also available from `@workspace/ui/components/sidebar`.

### Primitives

`accordion`, `badge`, `button`, `card`, `checkbox-group`, `color-picker`, `combobox`, `dialog`, `dropdown`, `dropdown-search`, `input-copy`, `input-group`, `input-message`, `menu-item`, `mobile-drawer`, `radio-group`, `scroll-area`, `select`, `sidebar`, `slider`, `switch`, `table`, `tabs`, `tabs-subtle`, `tooltip`, `thinking-indicator`, `thinking-steps`.

### Domain

`ask-user-questions`, `chat-message`, `file-thumbnail`, `queued-stack`, `fluid-hover-highlight`.

### Blocks (sidebar shell)

Building blocks in `packages/ui/src/components/sidebar/`: `workspace-header`, `user-footer`, `search-field`, `inset-topbar`, plus `nav-data` (seed). `@workspace/ui/components/sidebar/settings-dialog` is also a block.

**There is no canonical `app-sidebar` in `@workspace/ui`.** The registry ships a stock example, but it is intentionally not a reusable block — every app's nav, auth, and routing differs. Compose your own in the app (e.g. `apps/web/components/layout/app-sidebar.tsx`) using the blocks above and the `Sidebar*` primitives from `@workspace/ui/components/sidebar`.

### Theme + system

Surface tokens (8-step bg/shadow ladder) wired in `packages/ui/src/styles/globals.css`, plus shared lib primitives: `spring`, `surface-classes`, `surface-context`, `shape-context`, `size-context`, `icon-context`, `font-weight`, `elevated`, `popup`, `use-fluid-hover`, `use-touch-primary`, `use-merge-split`, `use-keyboard-nav-gate`.

## Install a new component

Two registry aliases are configured in `packages/ui/components.json`:

- `@fluid` → Base UI flavor (`/r/base/{name}.json`). **This is the project's primitive — use this for all new installs.**
- `@fluid-radix` → Radix flavor (`/r/{name}.json`). Only for components that don't exist in base (e.g. `badge`, `card`, `table`, `chat-message`, `file-thumbnail`, `thinking-indicator`).

Always run the install from `packages/ui` so files land in the right package:

```bash
cd packages/ui
npx shadcn@latest add @fluid/<component> --overwrite --yes
# Radix-only components:
npx shadcn@latest add @fluid-radix/<component> --overwrite --yes
```

After installing:

1. Re-run `pnpm --filter @workspace/ui typecheck` and `pnpm --filter web typecheck`.
2. Re-export the new component from `packages/ui/src/components/sidebar.tsx` if consumers should be able to import it alongside shell primitives.
3. Add a brief entry to the "Installed components" section above.

## Import patterns

```tsx
// Single primitive
import { Button } from "@workspace/ui/components/button"

// Shell surface (sidebar, dropdown, menu-item, card, tooltip, scroll-area, surface tokens)
import {
  Sidebar,
  SidebarContent,
  Dropdown,
  DropdownTrigger,
  Tooltip,
  ScrollArea,
  surfaceClasses,
  spring,
  useIcon,
  type IconName,
} from "@workspace/ui/components/sidebar"

// System primitives (each has a dedicated doc file)
import {
  useFluidHover, FluidHoverHighlight,
  SizeProvider, useSize, useTypeScale,
  Elevated, surfaceClasses, surfaceHoverClasses,
} from "@workspace/ui/components/sidebar"
```

Cross-package consumers (`apps/web`, future apps) go through `@workspace/ui/*`; never import `@workspace/ui/src/...` directly.

## Required conventions

- **No raw HTML where a fluid component exists.** Use `Button` instead of `<button>`, `Card` instead of styled `<div>`, `ScrollArea` instead of `overflow-auto`, etc.
- **No raw `<a>` for nav.** `Card` has an internal `href` prop that renders an anchor overlay — don't write your own.
- **No third-party UI libraries.** No Radix UI, no shadcn defaults from the standard registry, no MUI, no Headless UI. Base UI is already the primitive behind every fluid component.
- **Icons go through the slot system.** Components render icons by `name` (e.g. `chevron-right`) via `useIcon`. Lucide is the default. Don't import from `lucide-react` directly inside feature code unless you're augmenting the icon map via `<IconProvider icons={...}>`.
- **Theme tokens come from `globals.css`.** Surface colors, shadows, radii, and the Inter variable font (required for `font-weight` animations) are wired in `packages/ui/src/styles/globals.css`. Don't redefine colors as Tailwind values.
- **Motion uses `spring` and `framer-motion`.** Don't hand-write CSS transitions for state changes that fluid components already animate (hover, merge/split, popovers, sidebars). See [motion.md](./motion.md).
- **Sizes are a region decision.** Wrap dense surfaces in `SizeProvider`, don't toggle per-control. See [sizes.md](./sizes.md).
- **Surfaces use `surfaceClasses` + `<Elevated>`.** Never hand-roll a panel background. See [surfaces.md](./surfaces.md).
- **Lists, menus, grids use `useFluidHover` + `FluidHoverHighlight`.** Never `:hover` on individual rows. See [fluid-hover.md](./fluid-hover.md).

## Quick recipes

```tsx
// Sidebar primitives (always from the sidebar barrel)
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarProvider,
  SidebarInset, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuAction, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubItem,
  SidebarMenuSubButton, SidebarGroup, SidebarGroupLabel, SidebarTrigger,
  DropdownMenu, DropdownTrigger, DropdownContent, MenuItem,
  Tooltip, Button, Card, ScrollArea,
  surfaceClasses, surfaceHoverClasses, spring, useIcon, useSidebar, type IconName,
} from "@workspace/ui/components/sidebar"

// Optional sidebar blocks (workspace header, user footer, search field, inset topbar)
import {
  SidebarWorkspaceHeader, SidebarUserFooter, SidebarSearchField,
} from "@workspace/ui/components/sidebar/..."

// Settings dialog pattern
import { SettingsDialog } from "@workspace/ui/components/sidebar/settings-dialog"

// Chat surface
import { ChatMessage, ThinkingSteps, ThinkingIndicator } from "@workspace/ui/components/chat-message"

// Form primitives
import { InputGroup, InputMessage, InputCopy } from "@workspace/ui/components/input-group"

// Compact region
import { SizeProvider, useSize } from "@workspace/ui/components/sidebar"

// Fluid hover list
import { useFluidHover, FluidHoverHighlight } from "@workspace/ui/components/sidebar"

// Nested surface (popover inside dialog)
import { Elevated } from "@workspace/ui/components/sidebar"
```

**Compose `AppSidebar` in the app**, not in `@workspace/ui`. The web app's example is `apps/web/components/layout/app-sidebar.tsx` — wire it to that app's nav model, session, and routing.

## Verification

Before finishing any UI change:

1. `pnpm --filter @workspace/ui typecheck` — must pass (pre-existing `use-merge-split` strictness warnings are not from this skill).
2. `pnpm --filter web typecheck` — must pass.
3. `pnpm --filter @workspace/ui lint` — 0 errors expected.
4. Manual smoke in the running app: hover, focus-visible, dark mode, mobile breakpoint, reduced-motion ON.

## Reference

- Catalog + live playground: <https://www.fluidfunctionalism.com/docs>
- System docs: <https://www.fluidfunctionalism.com/docs/fluid-hover>, [/motion](https://www.fluidfunctionalism.com/docs/motion), [/scrollbars](https://www.fluidfunctionalism.com/docs/scrollbars), [/sizes](https://www.fluidfunctionalism.com/docs/sizes), [/surfaces](https://www.fluidfunctionalism.com/docs/surfaces)
- Registry JSON: <https://www.fluidfunctionalism.com/r/registry.json>
- Base flavor: <https://www.fluidfunctionalism.com/r/base/{name}.json>
- Radix flavor: <https://www.fluidfunctionalism.com/r/{name}.json>
