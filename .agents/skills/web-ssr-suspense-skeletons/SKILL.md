---
name: web-ssr-suspense-skeletons
description: Web app architectural standard - SSR-first with React Suspense + skeleton fallbacks, powered by Next.js 16 Cache Components (PPR) and Instant Navigation. Apply to every page, layout, route, and feature built inside apps/web.
user-invocable: false
---

# Web App Architecture Standard: SSR + Suspense + Skeletons

This is the **default architecture for `apps/web`**. Every page, layout, route, and feature built in this app must follow it. Treat any deviation as an exception that needs justification.

The architecture is built on three pillars:

1. **SSR by default** — every route renders on the server. There is no client-only rendering for page shells.
2. **React Suspense + skeletons** — dynamic content streams in behind skeletons that match the final UI shape (no spinners, no blank screens).
3. **Cache Components + Instant Navigation** — Next.js 16 PPR (`cacheComponents: true`) splits the page into static + cached + dynamic, and Instant Navigation delivers client-side transitions that feel native.

When you are generating, reviewing, or refactoring code in `apps/web`, treat this skill as the source of truth. The companion skills (`next-cache-components`, `react-best-practices`, `next-best-practices`, `composition-patterns`) provide deeper API references; this skill defines the **architecture** those APIs must satisfy.

---

## 1. Required Configuration

`apps/web/next.config.ts` must enable Cache Components and the Instant Navigation DevTools toggle. Do not remove these flags.

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
```

- `cacheComponents: true` — enables PPR, the `use cache` directive, `cacheLife`, `cacheTag`, and `updateTag`. Replaces the old `experimental.ppr` flag.
- `experimental.instantNavigationDevToolsToggle: true` — exposes the Instant Navigation toggle in Next.js DevTools so devs can validate SPA-feeling client transitions during local development.

If you find either flag disabled, restore it before continuing.

---

## 2. The Three Content Layers

Every page in `apps/web` is composed from three layers. Compose pages with all three, in this order, so the static shell is always painted first.

### Layer A — Static shell (auto-prerendered, instant)

Synchronous JSX, imports, pure computations. Rendered at build time, served from the CDN, painted on the first byte.

```tsx
export default function Page() {
  return (
    <main>
      <header>
        <h1>Dashboard</h1>
      </header>
      <nav>{/* links, breadcrumbs */}</nav>
      {/* Layer A only — fully static */}
    </main>
  )
}
```

**Rule:** the static shell must contain everything the user sees before data resolves — headings, navigation, layout chrome, empty-state containers. Never block the shell on a fetch.

### Layer B — Cached data (`use cache`)

Async data that is safe to share across requests and slow-changing. Cached at build time or with a short revalidation window.

```tsx
import { cacheLife, cacheTag } from "next/cache"

async function Stats() {
  "use cache"
  cacheLife("hours")
  cacheTag("dashboard-stats")

  const stats = await db.stats.aggregate()
  return <StatsDisplay stats={stats} />
}
```

**Rule:** if the data changes more than once a day, it does not belong in Layer B without a revalidation strategy. Tag every cached function so it can be invalidated.

### Layer C — Dynamic data (Suspense)

Request-time data: cookies, headers, user-scoped queries, search params. Must be wrapped in `Suspense` with a matching skeleton fallback.

```tsx
import { Suspense } from "react"
import { cookies } from "next/headers"

export default function Page() {
  return (
    <main>
      <header><h1>Dashboard</h1></header>

      {/* Layer B */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>

      {/* Layer C — streams in after the shell */}
      <Suspense fallback={<NotificationsSkeleton />}>
        <Notifications />
      </Suspense>
    </main>
  )
}

async function Notifications() {
  const userId = (await cookies()).get("userId")?.value
  const items = await db.notifications.findMany({ where: { userId } })
  return <NotificationList items={items} />
}
```

**Rule:** every Server Component that awaits request-time data must live inside a `Suspense` boundary. No exceptions. The fallback must be a skeleton — never a spinner, never an empty div.

---

## 3. Skeleton Rules

Skeletons are first-class UI. They are part of the design system, not a stopgap.

- **Match the final layout** — the skeleton's dimensions, spacing, and structure must mirror the real component. A card skeleton looks like a card; a list skeleton looks like a list.
- **Animate subtly** — use a gentle pulse or shimmer (`animate-pulse` in Tailwind is fine). No aggressive motion.
- **Co-locate with the component** — keep `<Foo />` and `<FooSkeleton />` in the same file or a sibling file. Skeletons are not a global component library.
- **No spinners inside route content** — spinners are only acceptable for full-page transitions and explicit user actions (button loading states). Inside a route, use a skeleton.
- **Prefer multiple skeletons over one big skeleton** — let the shell resolve piece by piece. A user sees the page come alive instead of waiting on a single loader.

Example pattern:

```tsx
// features/notifications.tsx
export function NotificationsSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex animate-pulse gap-3">
          <div className="size-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

---

## 4. Suspense Placement Rules

Where you put a `Suspense` boundary decides what streams in independently. Place them at the **highest level that is still safe** — coarse boundaries stream more in parallel, fine boundaries give finer skeletons.

| Boundary location                                 | When to use                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Around an entire route (via `loading.tsx`)        | Default for any new route. Matches the final UI of `page.tsx`.              |
| Around a feature section inside `page.tsx`        | When the page is multi-section and each section has its own data source.    |
| Around a single card or item                      | When the rest of the page should render immediately and one slot is slow.   |
| Inside a client component                          | Avoid. Wrap on the server side and pass the streamed subtree as children.   |

**Route-level default:** create `app/<route>/loading.tsx` that exports a skeleton matching `page.tsx`. This is the simplest correct implementation.

```tsx
// app/dashboard/loading.tsx
import { DashboardSkeleton } from "@/features/dashboard/skeleton"

export default function Loading() {
  return <DashboardSkeleton />
}
```

---

## 5. Component Composition for Suspense

Server Components cannot be passed as props or rendered dynamically by name in some cases. Use the composition patterns below to keep Suspense boundaries clean.

### Pattern 1 — Direct child (preferred)

```tsx
<Suspense fallback={<FooSkeleton />}>
  <Foo />
</Suspense>
```

### Pattern 2 — Children prop for layout-driven slots

```tsx
function Panel({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <Suspense fallback={fallback}>{children}</Suspense>
    </section>
  )
}

// Usage
<Panel fallback={<StatsSkeleton />}>
  <Stats />
</Panel>
```

### Pattern 3 — Async server component as a leaf

```tsx
async function SlowList({ query }: { query: string }) {
  const items = await searchItems(query)
  return <List items={items} />
}

// Caller wraps it
<Suspense fallback={<ListSkeleton />}>
  <SlowList query={term} />
</Suspense>
```

Never put `'use client'` on a component just to satisfy Suspense. Server Components can be children of `Suspense` directly.

---

## 6. Caching Discipline

Inside this architecture, caching is mandatory for any data that does not change per-request.

| Data shape                                  | Cache strategy                                          |
| ------------------------------------------- | -------------------------------------------------------- |
| Build-time content, docs, marketing copy    | Layer A — no fetch needed                                |
| Aggregations, lists, indexes                | Layer B — `'use cache'` + `cacheLife('hours' \| 'days')` |
| Per-user state, current session             | Layer C — `Suspense` + no cache                          |
| Personalized content (e.g., recommendations)| Layer C with private cache if revalidation is acceptable |

**Always tag your caches.** Without a `cacheTag`, you cannot invalidate when the underlying data changes.

**Never put runtime APIs inside `use cache`.** `cookies()`, `headers()`, and `searchParams` will throw — extract them outside and pass them as arguments, or use `'use cache: private'` only when refactoring is impossible.

---

## 7. Instant Navigation

Next.js 16 Instant Navigation makes client-side route transitions feel like a native SPA without losing the SSR model.

- Keep `<Link>` usage for in-app navigation. The Instant Navigation runtime intercepts these.
- Avoid full-page reloads (`window.location`) for in-app navigation.
- Use `useRouter()` from `next/navigation` for programmatic navigation; do not push raw history entries.
- Verify Instant Navigation in DevTools using the toggle enabled by `experimental.instantNavigationDevToolsToggle`. If transitions feel broken, check the toggle first.

---

## 8. Anti-Patterns (do not do)

| Anti-pattern                                                         | Why it breaks the architecture                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `"use client"` on a page component                                   | Bypasses SSR; defeats the whole point                                 |
| `useEffect` + `useState` for initial data fetch                      | Client-side waterfall; SSR can produce it on the server              |
| One global `<Spinner />` for the whole route                         | No skeleton = layout shift, no perceived progress                    |
| `await fetch()` in `page.tsx` without `Suspense`                     | Blocks the static shell from streaming                               |
| `dynamic = "force-dynamic"` on every route                           | Defeats PPR; use Layer C with `Suspense` instead                     |
| `unstable_cache` (legacy)                                            | Replaced by `'use cache'` — migrate to the new directive              |
| Empty `<div>` or `null` as a Suspense fallback                      | Causes layout shift; always provide a matching skeleton              |
| Putting `cookies()`/`headers()` inside `'use cache'`                 | Throws at build time — extract outside or use `'use cache: private'` |
| Disabling `cacheComponents` "to fix a build error"                   | Fix the directive boundary instead; never disable the flag globally   |
| Putting a route-specific component directly in `page.tsx`            | Bloats the Server Component; harder to read, test, and reuse         |
| Putting a route-specific component in `components/` or `features/`   | Leaks route internals into the global namespace; couples unrelated routes |
| Naming a colocated folder `components/` (no underscore) inside `app/<route>/` | Becomes a public route segment (`/route/components`) — collision risk |
| Importing across routes via `app/<other-route>/_components/...`      | Cross-route coupling; if the source route changes, every consumer breaks silently |

---

## 9. Definition of Done (per page or feature)

Before merging any change to `apps/web`, confirm:

- [ ] `page.tsx` is a Server Component (no `"use client"` at the top).
- [ ] A `loading.tsx` with a matching skeleton exists at the route level, OR every dynamic section is wrapped in `Suspense` with a skeleton fallback.
- [ ] All shared/aggregated data uses `'use cache'` + `cacheLife` + `cacheTag`.
- [ ] All request-time data is inside a `Suspense` boundary.
- [ ] No `useEffect` is used to fetch data that could be fetched in a Server Component.
- [ ] No spinners are used inside route content; only skeletons.
- [ ] Instant Navigation works for in-app links (verified in DevTools).
- [ ] `next.config.ts` still has `cacheComponents: true` and `experimental.instantNavigationDevToolsToggle: true`.
- [ ] Route-specific components live in `app/<route>/_components/`, not inlined in `page.tsx` and not leaked into `components/` or `features/`.

---

## 10. Quick Reference

```tsx
// app/dashboard/page.tsx
import { Suspense } from "react"
import { Stats } from "@/features/dashboard/stats"
import { Notifications } from "@/features/dashboard/notifications"
import { StatsSkeleton } from "@/features/dashboard/skeleton"
import { NotificationsSkeleton } from "@/features/dashboard/notifications.skeleton"

export default function DashboardPage() {
  return (
    <main className="space-y-8 p-6">
      {/* Layer A — static shell */}
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </header>

      {/* Layer B — cached */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>

      {/* Layer C — dynamic */}
      <Suspense fallback={<NotificationsSkeleton />}>
        <Notifications />
      </Suspense>
    </main>
  )
}
```

```tsx
// features/dashboard/stats.tsx
import { cacheLife, cacheTag } from "next/cache"
import { db } from "@/lib/db"

export async function Stats() {
  "use cache"
  cacheLife("hours")
  cacheTag("dashboard-stats")

  const stats = await db.stats.aggregate()
  return <StatsDisplay stats={stats} />
}
```

```tsx
// app/dashboard/loading.tsx
import { DashboardSkeleton } from "@/features/dashboard/skeleton"

export default function Loading() {
  return <DashboardSkeleton />
}
```

---

## Related Skills

Cache Components is shipped through **three complementary skills**, each scoped to a different question:

| Skill                                | Question it answers                                                    | When to invoke                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `next-cache-components`              | *How do I write the API?* (`'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, PPR semantics)   | Writing or reviewing any cached function / component. Read once, then on-demand.                             |
| `next-cache-components-adoption`     | *The flag is on and the build is red — how do I land it?*              | The first time `cacheComponents: true` is enabled, when adopting Cache Components on a new app, or after a Next.js upgrade that flipped the flag. |
| `next-cache-components-optimizer`    | *My route isn't instant — how do I push the static shell up?*           | After adoption is green: a route's static shell doesn't commit immediately, an `instant()` e2e fails, or first paint is slow. |

**Order matters.** Adoption → reference → optimizer. Do not invoke the optimizer before adoption is green (every blocker in the build is a candidate for the optimizer's e2e loop, but until the build passes, the loop is noise). Use the API reference (`next-cache-components`) freely during all three phases.

Other related skills:

- `next-best-practices` — file conventions, async APIs, runtime selection, error handling.
- `react-best-practices` — performance patterns for Server and Client Components.
- `composition-patterns` — Suspense-friendly component APIs (compound components, slot patterns).
- `frontend-design` — visual design system that skeletons should match.

When any of these skills conflicts with this one on architecture (SSR/Suspense/skeletons/caching), **this skill wins**. The others provide API mechanics; this skill defines the rules.

---

## 11. Server-First UI Architecture

> **Rule.** Server-first is not a style preference — it is the default. Every
> component starts as a Server Component. Add `"use client"` only when the
> component genuinely needs to run in the browser.

A Client Component is justified **only** when at least one of the following applies:

- React client hooks: `useState`, `useEffect`, `useReducer`, `useRef`, etc.
- Event handlers (`onClick`, `onChange`, etc.) that mutate local UI state.
- Browser-only APIs (`window`, `localStorage`, `IntersectionObserver`, `navigator`).
- Third-party libraries that require browser execution (dialkit, cuelume, next-themes, sonner, TanStack Query, Better Auth React).
- React context that carries mutable, per-tab state.

If none of the above apply, the component is a Server Component. Period.

This rule applies especially to:

- **Layouts** — the root `app/layout.tsx` and authenticated `app/app/layout.tsx`. Auth gates are `async` RSC, not `useEffect` + `router.replace`.
- **Pages** — every `page.tsx` is a Server Component. A page that needs interactive children composes Server + Client islands.
- **Data loaders** — read paths live in Server Components, fetch via `lib/api/server.ts`, and pass serialisable props down. Client Components own only mutations.
- **Auth/authz** — `await getServerSession()` + `redirect()` server-side. Never a `useEffect` redirect.
- **Headers/cookies/redirects** — all server-side via `next/headers` + `next/navigation`. Not in Client Components.
- **Static shells** — purely presentational helpers (`WorkspacePane`, `AgentCard`, `AgentStatus`, `ChatMessageList`, `SignUpRedirectForm`) have **no** `"use client"`. Their interactive controls are imported as Client Component children from RSC parents.

### The pre-flight checklist for any new component

Before adding `"use client"`, answer:

> "Does this component really need to run in the browser?"

If you cannot point to one of the bullets above, the component stays a Server Component. The few kilobytes of hydrated JS you avoid are the entire point.

Before introducing a `<Suspense>` boundary, answer:

> "Can this part of the UI load independently and benefit from streaming or a fallback?"

If yes, wrap it in `<Suspense>` with a matching skeleton. If the whole page is one short render, a single route-level `loading.tsx` is enough.

---

## 12. Server-Side Auth & Data Fetching

### Auth gate (canonical pattern)

```tsx
// app/app/layout.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  return <AppShell>{children}</AppShell>
}
```

The brief async window is covered by `loading.tsx` at the route level. `AuthSessionProvider` (Client) still mounts at the root layout so `UserMenu` / `OrganizationSwitcher` keep their reactive `useSession()`.

### Auth helper

`apps/web/lib/auth/server.ts` exposes `getServerSession()` — `import "server-only"`, wraps the HTTP call to `/api/auth/get-session` in `cache()` from React so concurrent calls in one request dedupe.

```tsx
import { getServerSession } from "@/lib/auth/server"
const session = await getServerSession()
```

### Server fetch helper

`apps/web/lib/api/server.ts` exposes `serverApiFetch(path, init)`. It is isomorphic-shaped to the browser `apiFetch`, but:

- reads `cookie` from `await headers()` and forwards it,
- uses `API_URL` (or `NEXT_PUBLIC_API_URL` fallback) as base,
- forces `cache: "no-store"` unless overridden,
- throws `ApiError` on non-2xx and validates responses via the same Zod schemas when `init.schema` is provided.

**Never** import `lib/api/server.ts` from a Client Component (the `import "server-only"` directive will fail the build).

### Server Actions

For mutations that need to invalidate `'use cache'` reads, use a Server Action:

```tsx
// features/agents/actions/update-agent.ts
"use server"
import { revalidateTag } from "next/cache"
import { serverApiFetch } from "@/lib/api/server"

export async function updateAgentAction(id: string, body: { enabled?: boolean }) {
  const { agent } = await serverApiFetch(`/api/agents/${id}`, {
    method: "PATCH",
    body,
    schema: AgentEnvelopeSchema,
  })
  revalidateTag("agents")
  revalidateTag(`agent:${id}`)
  return agent
}
```

Client components import the action directly. The Next.js runtime handles the call boundary.

### Anti-patterns (server-side)

| Anti-pattern                                                         | Why it breaks the architecture                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `"use client"` on `app/app/layout.tsx` (auth gate via `useEffect`)   | HTML protected ships to anonymous users; "Redirecting…" flash; extra hydration |
| Adding `@workspace/auth` to `apps/web` to call `auth.api.getSession` server-side | Drags DB credentials into the web bundle and breaks the `web → contracts` dependency rule |
| Client-side `useEffect` fetching for a page's primary content         | Adds a round-trip after hydration when the page could SSR the data |
| Importing `lib/api/server.ts` from a Client Component                 | `import "server-only"` will fail the build — this is intentional     |
| Wrapping a `redirect("/login")` in `try/catch`                        | `redirect()` throws to be caught by Next.js; catching it swallows the navigation |

---

## 13. `use cache` & Cache Components Discipline

When `cacheComponents: true` is enabled (see `next.config.ts`), the following apply on top of the § § rules:

- Reads that don't change per request use `'use cache'` + `cacheLife()` + `cacheTag()`. Server Components read the data; Client Components receive serialisable props.
- Reads that are session- or cookie-dependent stay outside `'use cache'` scope. Extract the session/cookie **before** calling the cached function and pass identifiers as arguments — the cache key is automatically derived from serialisable arguments and closure values.
- Mutations that need to invalidate the cache go through a Server Action that calls `revalidateTag()` (background) or `updateTag()` (same-request) from `next/cache`.
- Never disable `cacheComponents` to silence a build error. Fix the directive boundary.

### Anti-pattern (caching)

| Anti-pattern                                                         | Why it breaks the architecture                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `await fetch()` in `page.tsx` without `'use cache'` and without `<Suspense>` | Blocks the static shell; defeats streaming                          |
| `'use cache'` wrapping a `getServerSession()` or `cookies()` call    | Throws at build time — extract outside or use `'use cache: private'` |
| Disabling `cacheComponents` "to fix a build error"                   | Fix the directive boundary instead                                   |

---

## 14. Feature File Layout & Component Colocation

Every component in `apps/web` belongs in **exactly one** of three tiers.
Pick the tier by answering two questions:

1. *Is the component used by more than one route?* — if no, it is route-specific.
2. *Is the component a domain primitive (chat message, agent card, calendar event) shared across routes within a domain?* — if yes, it is a domain primitive.

### The three tiers

```
apps/web/
├── components/                  # Tier 1 — GLOBAL (cross-route, cross-domain)
│   ├── theme-provider.tsx
│   └── layout/
│       ├── app-sidebar.tsx
│       └── workspace-pane.tsx
│
├── features/                    # Tier 2 — DOMAIN (reused across routes in the same domain)
│   ├── chat/
│   │   ├── chat-thread.tsx
│   │   ├── chat-composer.tsx
│   │   └── index.ts
│   └── auth/
│       └── components/
│
└── app/                         # Tier 3 — ROUTE (colocated, single route only)
    └── dashboard/
        └── chat/
            ├── page.tsx          # thin Server Component wrapper
            ├── loading.tsx       # route-level skeleton
            └── _components/      # ← underscore prefix: private, not a route
                └── chat-panel.tsx
```

| Tier | Path                              | Used by                          | Examples                                                |
| ---- | --------------------------------- | -------------------------------- | ------------------------------------------------------- |
| 1    | `apps/web/components/`            | Any route, any domain            | `theme-provider`, `app-sidebar`, `workspace-pane`       |
| 2    | `apps/web/features/<domain>/`     | Multiple routes in one domain    | `chat-thread`, `chat-composer`, `login-form`            |
| 3    | `apps/web/app/<route>/_components/` | **Exactly one** route          | `chat-panel` (used only by `/dashboard/chat`)          |

### The `_components/` convention

A folder inside `app/` whose name starts with `_` is a **private folder**: Next.js excludes it from routing, so it can only be imported. This is the convention for **Tier 3 — route-specific colocated components**.

```tsx
// app/dashboard/chat/page.tsx
import { WorkspacePane } from "@/components/layout/workspace-pane"
import { ChatPanel } from "@/app/dashboard/chat/_components/chat-panel"

export default function ChatPage() {
  return (
    <WorkspacePane>
      <ChatPanel />
    </WorkspacePane>
  )
}
```

```tsx
// app/dashboard/chat/_components/chat-panel.tsx — Tier 3, "use client"
"use client"

import { useState } from "react"
import { ChatThread, ChatComposer } from "@/features/chat"

export function ChatPanel() {
  const [entries, setEntries] = useState(/* ... */)
  // route-specific orchestration of domain primitives
}
```

### Decision rule (apply in order)

```
Is the component used by ≥ 2 routes OR a layout primitive (sidebar, header, theme)?
  → Tier 1: apps/web/components/

Otherwise, is the component a reusable primitive within a single domain
       (e.g. a chat bubble rendered by chat routes, an agent card)?
  → Tier 2: apps/web/features/<domain>/

Otherwise, the component is route-specific (orchestrates Tier 1 + Tier 2
       for one page, holds route-local state, or wires Suspense):
  → Tier 3: apps/web/app/<route>/_components/
```

### Why this matters

- **Deletion is safe.** If a route is removed, its `_components/` goes with it. No orphan files in a global barrel.
- **No accidental public routes.** A folder literally named `components/` (without `_`) inside `app/<route>/` would be a valid URL segment. The `_` prefix makes the intent unambiguous.
- **Right-sized imports.** Importing `@/components/...` is a strong signal that the dependency is global and stable. Importing `@/app/<route>/_components/...` is a strong signal that the dependency is local and may change.
- **Matches Server / Client boundaries.** Tier 3 typically holds stateful Client Components that orchestrate Tier 2 Server-friendly primitives. The colocated `_components/` is the natural home for the `"use client"` shell that wraps the route.

### Anti-patterns (file layout)

| Anti-pattern                                                         | Why it breaks the architecture                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `components/` (no underscore) inside `app/<route>/`                  | Becomes a public route segment (`/route/components`) — collision risk |
| Route-specific component inlined in `page.tsx`                       | Bloats the Server Component; harder to read, test, and split for Suspense |
| Route-specific component placed in `apps/web/components/`            | Pollutes the global namespace; couples unrelated routes               |
| Route-specific component placed in `apps/web/features/<other-domain>/` | Cross-domain coupling; wrong abstraction layer                       |
| Importing `app/<other-route>/_components/...` from a different route | Cross-route coupling; renames or removals break unrelated pages silently |
| Using barrel `index.ts` inside `_components/`                        | Hidden dependencies; harder to enforce the tier rule via grep        |

### Verification

Before merging any new component, run from the repo root:

```bash
# Tier 3: must live under app/<route>/_components/
rg -n "components/" apps/web/app | rg -v "/_components/"

# Tier 1/2: nothing route-specific should leak here
rg -n "apps/web/components/" apps/web/app
rg -n "apps/web/features/" apps/web/app
```

The first grep should return zero matches (only `_components/` allowed inside `app/`). The other two are informational — every match should be a justified Tier 1/2 import from a Server Component.

---

## 15. Cache Components Skill Routing

This project has `cacheComponents: true` enabled in `apps/web/next.config.ts` and follows the Cache Components mental model throughout § § 2, 6, and 13. Cache Components work is delivered through **three complementary skills** that must be invoked in the right order. Conflating them leads to slow adoption and broken e2e tests.

### The three skills and their scope

| Skill | Scope | Reads | Writes | Touches the build? |
| --- | --- | --- | --- | --- |
| `next-cache-components` | API reference. How `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, `revalidateTag`, and PPR semantics compose. | n/a | n/a | No |
| `next-cache-components-adoption` | Adoption sequence: enable the flag → resolve blocking routes → choose between `export const instant = false` and fixing in place → run the `cache-components-instant-false` codemod → land a passing build. | Build output, dev overlay | `next.config.ts`, `app/<route>/page.tsx`, `app/<route>/loading.tsx`, `app/<route>/_components/**`, `lib/**` | Yes — runs the codemod and the build |
| `next-cache-components-optimizer` | Optimization loop: turn a route into instant navigation using a failing `@next/playwright` `instant()` e2e + a production build with the testing API exposed, then push the static shell up by deferring blocking reads. | Build output, `instant()` failures, runtime waterfalls | Same surface as adoption | Yes — runs the production build and Playwright |

### Routing rules

```
User wants to enable / adopt / migrate to Cache Components
  → next-cache-components-adoption (always first)

User wants to write or review a cached function / component
  → next-cache-components (the API reference) — read on demand during adoption or while implementing a feature

Build is red with blocking-prerender / instant validation errors after enabling the flag
  → next-cache-components-adoption (do not invoke the optimizer until the build is green)

A route's static shell is missing or its first paint is slow
  → next-cache-components-optimizer (after adoption is green and the route is reachable)

User wants an instant() e2e guard for a route
  → next-cache-components-optimizer (it owns the test template + the production-rig scaffold)
```

### Order rule

`adoption` → `reference` (in parallel with both) → `optimizer`.

- **Do not** run `next-cache-components-optimizer` before `next-cache-components-adoption` is green. The optimizer's loop works against a passing build and a working dev server; if either is broken by an unfinished adoption, the `instant()` e2e fails for reasons unrelated to the static shell.
- **Do** read `next-cache-components` freely during any phase. It is a reference, not a workflow.

### What each skill owns

- `next-cache-components-adoption` owns the **strategic question**: "do we fix this route or opt it out with `export const instant = false`?". See `references/per-page-decisions.md` for the criteria and `references/dev-only-validations.md` for the validation level.
- `next-cache-components-optimizer` owns the **tactical question**: "given a reachable route, how do we make its static shell commit immediately?" See `rig-template.md` (production build rig), `test-template.md` (the `instant()` template), and `reference/patterns.md` / `reference/red-test-robustness.md` (blockers and fixes).

If a task is ambiguous, default to the **API reference** (`next-cache-components`) for reading and the **adoption** skill for writing until the build is green; only escalate to the optimizer when the question is specifically about static-shell shape, first paint, or `instant()` e2e.

### Conflict resolution

When a rule from any Cache Components skill conflicts with this one, **this skill wins** for *architectural* questions (where caching belongs in the three layers, when `'use cache'` is appropriate, how to compose with `Suspense`). The Cache Components skills win for *API mechanics* (the exact shape of `cacheLife`, the codemod flags, the rig template path, the `instant()` test API).
