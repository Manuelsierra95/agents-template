# Directives

## React Directives

These are React directives, not Next.js specific.

### `'use client'`

Marks a component as a Client Component. Required for:
- React hooks (`useState`, `useEffect`, etc.)
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`window`, `localStorage`)

```tsx
'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

Reference: https://react.dev/reference/rsc/use-client

### `'use server'`

Marks a function as a Server Action. Can be passed to Client Components.

```tsx
'use server'

export async function submitForm(formData: FormData) {
  // Runs on server
}
```

Or inline within a Server Component:

```tsx
export default function Page() {
  async function submit() {
    'use server'
    // Runs on server
  }
  return <form action={submit}>...</form>
}
```

Reference: https://react.dev/reference/rsc/use-server

---

## Next.js Directive

### `'use cache'`

Marks a function or component for caching. Part of Next.js Cache Components.

```tsx
'use cache'

export async function getCachedData() {
  return await fetchData()
}
```

Requires `cacheComponents: true` in `next.config.ts`.

Cache Components is shipped across three complementary skills. Pick the one that matches the task:

- `next-cache-components` — API reference (`'use cache'` placement, `cacheLife`, `cacheTag`, `updateTag`, PPR semantics). Read this when writing any cached function.
- `next-cache-components-adoption` — *how to enable and land* the flag in a project. Use on the first enable, after a Next.js upgrade, or when the build is failing with blocking-prerender / instant validation errors.
- `next-cache-components-optimizer` — *how to grow a route's static shell* to instant navigation with `@next/playwright`. Use after adoption is green, when a route's static shell doesn't commit immediately or an `instant()` e2e fails.

The architectural rules around *when* to cache, *what* to cache, and *how* to layer it with `Suspense` + skeletons live in `web-ssr-suspense-skeletons`. That skill is the source of truth; the three above provide the mechanics.

Reference: https://nextjs.org/docs/app/api-reference/directives/use-cache
