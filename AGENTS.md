<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:cache-components-config -->
# Cache Components — Required Configuration

`apps/web/next.config.ts` **must** keep these flags on. If you find either disabled, restore them before continuing — every other architectural rule in this file depends on them being present.

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,                                     // PPR + 'use cache' + cacheLife + cacheTag + updateTag
  experimental: {
    instantNavigationDevToolsToggle: true,                   // exposes the Instant Navigation toggle in DevTools
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
```

| Flag | What it unlocks |
| --- | --- |
| `cacheComponents: true` | PPR, `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`. Replaces the old `experimental.ppr` flag. |
| `experimental.instantNavigationDevToolsToggle: true` | SPA-feeling client transitions during local dev. Verify Instant Navigation works before merging. |

**Never** disable `cacheComponents` to silence a build error — fix the directive boundary instead. The full rule lives in `web-ssr-suspense-skeletons` §1.
<!-- END:cache-components-config -->

<!-- BEGIN:three-content-layers -->
# The Three Content Layers

Every page in `apps/web` is composed from **three layers, in this order**, so the static shell is always painted first. Do not reorder; do not skip a layer.

### Layer A — Static shell (auto-prerendered, instant)

Synchronous JSX, imports, pure computations. Rendered at build time, served from the CDN, painted on the first byte. **The static shell must contain everything the user sees before data resolves** — headings, navigation, layout chrome, empty-state containers. Never block the shell on a fetch.

### Layer B — Cached data (`'use cache'`)

Async data that is safe to share across requests and slow-changing. Wrapped with `'use cache'` + `cacheLife()` + `cacheTag()`. If the data changes more than once a day, it does **not** belong in Layer B without a revalidation strategy.

```tsx
async function Stats() {
  "use cache"
  cacheLife("hours")
  cacheTag("dashboard-stats")
  const stats = await db.stats.aggregate()
  return <StatsDisplay stats={stats} />
}
```

### Layer C — Dynamic data (`<Suspense>`)

Request-time data: cookies, headers, user-scoped queries, search params. Must be wrapped in `<Suspense>` with a matching skeleton fallback. **Every Server Component that awaits request-time data must live inside a `Suspense` boundary.** No exceptions.

```tsx
export default function Page() {
  return (
    <main>
      <header><h1>Dashboard</h1></header>

      {/* Layer B — cached */}
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
```

The full rule (with the build-time behaviour, PPR streaming, and the `loading.tsx` route-level fallback) lives in `web-ssr-suspense-skeletons` §2.
<!-- END:three-content-layers -->

<!-- BEGIN:skeleton-rules -->
# Skeleton Rules

Skeletons are first-class UI — part of the design system, not a stopgap.

- **Match the final layout.** Dimensions, spacing, structure mirror the real component. A card skeleton looks like a card; a list skeleton looks like a list.
- **Animate subtly.** Gentle pulse or shimmer (`animate-pulse` in Tailwind is fine). No aggressive motion.
- **Co-locate with the component.** Keep `<Foo />` and `<FooSkeleton />` in the same file or a sibling file. Skeletons are **not** a global component library.
- **No spinners inside route content.** Spinners are only acceptable for full-page transitions and explicit user actions (button loading states). Inside a route, use a skeleton.
- **Prefer multiple skeletons over one big skeleton.** Let the shell resolve piece by piece — the page comes alive instead of waiting on a single loader.

The full rule (with copy-paste examples) lives in `web-ssr-suspense-skeletons` §3.
<!-- END:skeleton-rules -->

<!-- BEGIN:suspense-placement -->
# Suspense Placement Rules

Where you put a `Suspense` boundary decides what streams in independently. Place boundaries at the **highest level that is still safe** — coarse boundaries stream more in parallel, fine boundaries give finer skeletons.

| Boundary location                                 | When to use                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Around an entire route (via `loading.tsx`)        | **Default for any new route.** Matches the final UI of `page.tsx`.          |
| Around a feature section inside `page.tsx`        | When the page is multi-section and each section has its own data source.    |
| Around a single card or item                      | When the rest of the page should render immediately and one slot is slow.   |
| Inside a client component                          | **Avoid.** Wrap on the server side and pass the streamed subtree as children. |

**Route-level default:** create `app/<route>/loading.tsx` that exports a skeleton matching `page.tsx`. The skeleton is the route-level fallback.

**Don't double up.** Next.js renders `loading.tsx` *outside* `page.tsx` — it covers the entire route while `page.tsx` is suspended. If a route shell already has a `loading.tsx`, the inner `<Suspense>` should **not** carry a generic fallback (e.g. `<WorkspacePaneSkeleton />`). Set a fallback only on the Suspense that wraps an actually-async leaf, and make that fallback **specific to that section** — not a re-used shell skeleton. Inner fallback + `loading.tsx` is duplicate work: only the closer boundary wins, and only when the leaf is actually streaming.

```tsx
// app/dashboard/loading.tsx
import { DashboardSkeleton } from "@/features/dashboard/skeleton"

export default function Loading() {
  return <DashboardSkeleton />
}
```

The full rule (boundary sizing, streaming trade-offs) lives in `web-ssr-suspense-skeletons` §4.
<!-- END:suspense-placement -->

<!-- BEGIN:suspense-composition -->
# Component Composition for Suspense

Server Components cannot always be passed as props or rendered by name — use these composition patterns to keep Suspense boundaries clean.

| Pattern | When to use |
| --- | --- |
| **Direct child** — `<Suspense fallback={<FooSkeleton />}><Foo /></Suspense>` | Preferred default. The async server component is a leaf of the boundary. |
| **Children prop** — `<Panel fallback={…}>{children}</Panel>` wrapping `<Suspense>` | When a layout-driven slot needs to wrap the streamed subtree. |
| **Async server component as a leaf** — define `async function SlowList()` and let the caller wrap it | When the same async component is reused under different skeletons. |

```tsx
function Panel({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <Suspense fallback={fallback}>{children}</Suspense>
    </section>
  )
}
```

**Never** put `'use client'` on a component just to satisfy Suspense. Server Components are children of `Suspense` directly. The full rule lives in `web-ssr-suspense-skeletons` §5.
<!-- END:suspense-composition -->

<!-- BEGIN:caching-discipline -->
# Caching, Instant Navigation & Anti-Patterns

These three rules travel together: caching discipline, instant navigation, and the anti-patterns that break both.

## Caching discipline (Layers B + Cache Components)

- Reads that **don't change per request** use `'use cache'` + `cacheLife()` + `cacheTag()`. Server Components read the data; Client Components receive serialisable props.
- Reads that are **session- or cookie-dependent** stay outside `'use cache'` scope. Extract the session/cookie **before** calling the cached function and pass identifiers as arguments — the cache key is automatically derived from serialisable arguments and closure values.
- Mutations that need to invalidate the cache go through a Server Action that calls `revalidateTag()` (background) or `updateTag()` (same-request) from `next/cache`.
- **Always tag your caches.** Without a `cacheTag`, you cannot invalidate when the underlying data changes.
- **Never put runtime APIs inside `use cache`.** `cookies()`, `headers()`, and `searchParams` will throw — extract them outside and pass them as arguments, or use `'use cache: private'` only when refactoring is impossible.

| Data shape | Cache strategy |
| --- | --- |
| Build-time content, docs, marketing copy | Layer A — no fetch needed |
| Aggregations, lists, indexes | Layer B — `'use cache'` + `cacheLife('hours' \| 'days')` |
| Per-user state, current session | Layer C — `Suspense` + no cache |
| Personalized content (recommendations) | Layer C with private cache if revalidation is acceptable |

## Instant Navigation

- Keep `<Link>` for in-app navigation; the Instant Navigation runtime intercepts it.
- Avoid `window.location` for in-app navigation.
- Use `useRouter()` from `next/navigation` for programmatic navigation; do not push raw history entries.
- Verify in DevTools using the toggle enabled by `experimental.instantNavigationDevToolsToggle`. If transitions feel broken, check the toggle first.

## Anti-patterns (master table)

| Anti-pattern | Why it breaks the architecture |
| --- | --- |
| `"use client"` on a page component | Bypasses SSR; defeats the whole point |
| `useEffect` + `useState` for initial data fetch | Client-side waterfall; SSR can produce it on the server |
| One global `<Spinner />` for the whole route | No skeleton = layout shift, no perceived progress |
| `await fetch()` in `page.tsx` without `<Suspense>` | Blocks the static shell from streaming |
| `dynamic = "force-dynamic"` on every route | Defeats PPR; use Layer C with `<Suspense>` instead |
| `unstable_cache` (legacy) | Replaced by `'use cache'` — migrate to the new directive |
| Empty `<div>` or `null` as a Suspense fallback | Causes layout shift; always provide a matching skeleton |
| Generic fallback (`<WorkspacePaneSkeleton />` or similar) on an inner `<Suspense>` when the route already has a `loading.tsx` | Next.js renders `loading.tsx` outside `page.tsx` — it already covers the whole route. Inner fallback only matters for actually-async leaves; use a section-specific skeleton, not a generic one. |
| `cookies()` / `headers()` / `searchParams` inside `'use cache'` | Throws at build time — extract outside or use `'use cache: private'` |
| Disabling `cacheComponents` "to fix a build error" | Fix the directive boundary instead; never disable the flag globally |
| Putting a route-specific component directly in `page.tsx` | Bloats the Server Component; harder to read, test, reuse |
| Putting a route-specific component in `components/` or `features/` | Leaks route internals into the global namespace; couples unrelated routes |
| `components/` (no underscore) inside `app/<route>/` | Becomes a public route segment (`/route/components`) — collision risk |
| Importing across routes via `app/<other-route>/_components/...` | Cross-route coupling; if the source route changes, every consumer breaks silently |

The full rules (with rationale, code examples, and the §13 Cache Components additions) live in `web-ssr-suspense-skeletons` §6, §7, §8, and §13. This block is the always-on reminder.
<!-- END:caching-discipline -->

<!-- BEGIN:quick-reference -->
# Quick Reference (canonical page composition)

The canonical shape of a page in `apps/web`. Copy this pattern; deviate only with a written reason.

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

The full reference (with the file-layout, auth, and Server Actions patterns) lives in `web-ssr-suspense-skeletons` §10. This block is the canonical cheat-sheet; every other BEGIN/END block in this file references it.
<!-- END:quick-reference -->

<!-- BEGIN:cache-components-skill-routing -->
# Cache Components — Skill Routing

`apps/web` has `cacheComponents: true` enabled (`apps/web/next.config.ts`). Cache Components work is delivered through **three complementary skills**, invoked in this order:

1. **`next-cache-components-adoption`** — first-time enable, migration, and resolving blocking routes. Run the `cache-components-instant-false` codemod; decide between `export const instant = false` and fixing in place.
2. **`next-cache-components`** — API reference (`'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, `revalidateTag`, PPR semantics). Read on demand during any phase.
3. **`next-cache-components-optimizer`** — drive a route to instant navigation with `@next/playwright` `instant()` e2e + production-build rig. **Only after adoption is green.**

**Never invoke the optimizer before adoption is green.** A failing `instant()` test during an unfinished adoption is noise.

The architectural rules (where caching belongs, when to cache, how to layer with `Suspense` + skeletons, file layout, Server-First) live in the `web-ssr-suspense-skeletons` skill. When it conflicts with any Cache Components skill on architecture, **`web-ssr-suspense-skeletons` wins**. The Cache Components skills win on API mechanics.
<!-- END:cache-components-skill-routing -->

<!-- BEGIN:feature-file-layout -->
# Feature File Layout & Component Colocation

Every component in `apps/web` belongs in **exactly one** of three tiers. Pick by answering two questions:

1. *Used by ≥ 2 routes OR a layout primitive (sidebar, header, theme)?* → **Tier 1**.
2. *Reusable primitive within a single domain (chat bubble, agent card, calendar event)?* → **Tier 2**.
3. *Otherwise: route-specific (orchestrates Tier 1 + Tier 2, holds route-local state, wires Suspense)?* → **Tier 3**.

| Tier | Path | Used by | Examples |
| --- | --- | --- | --- |
| 1 | `apps/web/components/` | Any route, any domain | `theme-provider`, `app-sidebar`, `workspace-pane` |
| 2 | `apps/web/features/<domain>/` | Multiple routes in one domain | `chat-thread`, `chat-composer`, `login-form` |
| 3 | `apps/web/app/<route>/_components/` | **Exactly one** route | `chat-panel` (only `/dashboard/chat`) |

**Tier 3 uses the `_components/` underscore prefix** so Next.js excludes it from routing. A folder literally named `components/` (no underscore) inside `app/<route>/` becomes a public route segment (`/route/components`) — explicit anti-pattern.

**Import rule:** `@/components/...` = global, stable. `@/features/<domain>/...` = domain-scoped. `@/app/<route>/_components/...` = local, may change. Never import across routes via `app/<other-route>/_components/...` — cross-route coupling.

**Delete-safety:** removing a route removes its `_components/` with it. No orphan files in a global barrel.

The full rule (decision tree, anti-patterns, verification `rg` commands) lives in `web-ssr-suspense-skeletons` §14. That skill is the source of truth on file layout; this block is the always-on reminder.
<!-- END:feature-file-layout -->

<!-- BEGIN:server-first -->
# Server-First UI Architecture

> **Rule.** Server-first is not a style preference — it is the default. Every component starts as a Server Component. Add `"use client"` only when the component genuinely needs to run in the browser.

A Client Component is justified **only** when at least one of the following applies:

- React client hooks: `useState`, `useEffect`, `useReducer`, `useRef`, etc.
- Event handlers (`onClick`, `onChange`, etc.) that mutate local UI state.
- Browser-only APIs (`window`, `localStorage`, `IntersectionObserver`, `navigator`).
- Third-party libraries that require browser execution (next-themes, sonner, TanStack Query, Better Auth React).
- React context that carries mutable, per-tab state.

If none apply, the component is a Server Component. Period.

**Where this rule bites hardest:**

- **Layouts** — root `app/layout.tsx` and authenticated layouts. Auth gates are `async` RSC, not `useEffect` + `router.replace`.
- **Pages** — every `page.tsx` is a Server Component. Interactive children are composed as Client Component islands.
- **Data loaders** — read paths live in Server Components; Client Components own only mutations.
- **Auth/authz** — `await getServerSession()` + `redirect()` server-side. Never a `useEffect` redirect.
- **Headers / cookies / redirects** — server-side via `next/headers` + `next/navigation`. Never in Client Components.

**Pre-flight checklist** before adding `"use client"`:

> "Does this component really need to run in the browser?"

If you cannot point to one of the bullets above, the component stays a Server Component.

Pre-flight before introducing `<Suspense>`:

> "Can this part of the UI load independently and benefit from streaming or a fallback?"

The full rule (with examples per surface and the static-shell helpers list) lives in `web-ssr-suspense-skeletons` §11. That skill is the source of truth; this block is the always-on reminder.
<!-- END:server-first -->

<!-- BEGIN:definition-of-done -->
# Definition of Done (per page or feature)

Before merging any change to `apps/web`, confirm **every** item below. Treat the list as a checklist, not a wish list.

- [ ] `page.tsx` is a Server Component (no `"use client"` at the top).
- [ ] A `loading.tsx` with a matching skeleton exists at the route level, OR every dynamic section is wrapped in `<Suspense>` with a skeleton fallback.
- [ ] All shared / aggregated data uses `'use cache'` + `cacheLife` + `cacheTag`.
- [ ] All request-time data lives inside a `<Suspense>` boundary.
- [ ] No `useEffect` is used to fetch data that could be fetched in a Server Component.
- [ ] No spinners inside route content — only skeletons matching the final layout.
- [ ] Instant Navigation works for in-app links (verified in DevTools).
- [ ] `next.config.ts` still has `cacheComponents: true` and `experimental.instantNavigationDevToolsToggle: true`.
- [ ] Route-specific components live in `app/<route>/_components/`, not inlined in `page.tsx` and not leaked into `components/` or `features/`.

**Triple-check before merging:** §9 is binding for `apps/web`. The full rule with rationale, layered examples, and the auto-generated skeleton examples lives in `web-ssr-suspense-skeletons` §9. That skill is the source of truth; this block is the always-on checklist.
<!-- END:definition-of-done -->

<!-- BEGIN:server-side-auth-and-data -->
# Server-Side Auth & Data Fetching

All auth checks, server-side reads, and mutations go through three helpers that live in `apps/web/lib/`:

| Helper | Path | Use from |
| --- | --- | --- |
| `getServerSession()` | `lib/auth/server.ts` (`import "server-only"`) | **Server Components only** |
| `serverApiFetch(path, init)` | `lib/api/server.ts` (`import "server-only"`) | **Server Components and Server Actions only** |
| Server Actions (`"use server"`) | `features/<domain>/actions/*.ts` | Called from Client Components or `<form action={…}>` |

**The auth gate (canonical pattern).** Wraps every authenticated layout. The brief async window is covered by a route-level `loading.tsx`.

```tsx
// app/dashboard/layout.tsx
import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth/server"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  return <>{children}</>
}
```

`AuthSessionProvider` (Client) still mounts at the root layout so `UserMenu` / `OrganizationSwitcher` keep their reactive `useSession()` — the gate is RSC, the reactive UI is Client.

**Server Actions for mutations.** Anything that mutates and needs to invalidate `'use cache'` reads lives in a `"use server"` file and is called from Client Components or `<form action={…}>`. After the call, call `revalidateTag()` (background) or `updateTag()` (same-request) so the cached reads see fresh data.

### Hard rules

- **Never** import `lib/api/server.ts` from a Client Component — `import "server-only"` fails the build by design.
- **Never** add `@workspace/auth` to `apps/web` to call `auth.api.getSession` server-side — it drags DB credentials into the web bundle and breaks the `web → contracts` dependency rule.
- **Never** wrap `redirect("/login")` in `try/catch` — `redirect()` throws to be caught by Next.js; catching it swallows the navigation.
- **Never** do `useEffect` + `router.replace` for an auth gate — protected HTML ships to anonymous users and you get a "Redirecting…" flash.

### Anti-patterns (server-side)

| Anti-pattern                                                         | Why it breaks the architecture                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `"use client"` on `app/app/layout.tsx` (auth gate via `useEffect`)   | HTML protected ships to anonymous users; "Redirecting…" flash; extra hydration |
| Adding `@workspace/auth` to `apps/web` to call `auth.api.getSession` server-side | Drags DB credentials into the web bundle and breaks the `web → contracts` dependency rule |
| Client-side `useEffect` fetching for a page's primary content         | Adds a round-trip after hydration when the page could SSR the data |
| Importing `lib/api/server.ts` from a Client Component                 | `import "server-only"` will fail the build — this is intentional     |
| Wrapping a `redirect("/login")` in `try/catch`                        | `redirect()` throws to be caught by Next.js; catching it swallows the navigation |

The full rule (helper internals, schemas, mutations with `revalidateTag`) lives in `web-ssr-suspense-skeletons` §12. That skill is the source of truth; this block is the always-on reminder of *who calls what and what is forbidden*.
<!-- END:server-side-auth-and-data -->

# Tests

`pnpm test` is the canonical entrypoint. It runs every workspace's `test` script in series (via `pnpm -r --workspace-concurrency=1 --if-present run test`). Anything that should be verified on every push lives under a workspace's `test` script.

## First-time setup (one per machine)

```bash
docker compose -f packages/infra/docker/compose.yml up -d postgres
pnpm db:test:setup    # creates agents_test + applies Drizzle migrations
```

`pnpm db:test:setup` is idempotent — re-run it freely.

## Conventions

- Tests that need Postgres use `DATABASE_URL_TEST`. The root script defaults it to `postgresql://agents:agents@127.0.0.1:5432/agents_test` (the docker-compose dev DB), so `pnpm test` Just Works. Override the env var if you point at a different host.
- Suites that touch the DB truncate every relevant table in `beforeEach` (see `packages/auth/tests/helpers.ts:resetDb` and the inlined copy in `apps/api/tests/auth-battery.test.ts`). Two suites that share the same DB therefore cannot run in parallel — `--workspace-concurrency=1` enforces the ordering.
- New test files in `tests/` (or co-located `*.test.ts`) are auto-picked-up by the workspace's existing `vitest run` task. No wiring needed.

## Aliases

| Command | Scope |
|---|---|
| `pnpm test` | every workspace, serial |
| `pnpm test:auth` | `@workspace/auth` only |
| `pnpm test:api` | `apps/api` only |
| `pnpm test:db` | `@workspace/db` only |
| `pnpm test:web` | `apps/web` only |

## Pre-push rule

A `pre-push` git hook (`simple-git-hooks`) runs `pnpm test` before every `git push`. The hook is installed automatically by `pnpm install` via the `prepare` script. Bypass it for a single push with `SKIP_SIMPLE_GIT_HOOKS=1 git push …` — don't make a habit of it.

If a test fails, the push is blocked. Fix the test (or the bug it caught) and try again.
