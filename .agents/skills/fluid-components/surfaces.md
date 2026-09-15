# Surfaces

Eight surface levels that nest. Components read their **substrate** from context and lift relative to it, so popovers, dropdowns, and dialogs stay visible at any depth — in both light and dark mode.

The mechanism: every container publishes its current level via `SurfaceProvider`, the `<Elevated>` primitive computes its own level as `min(substrate + offset, 8)`, and nested surfaces walk up the ladder automatically. No prop drilling between layers.

## When to use

Every bounded surface in the app — cards, panels, popovers, dropdowns, dialogs — must participate in the surface system. Hand-styled `bg-white` / `bg-zinc-900` is forbidden; surface tokens (`bg-surface-N`) are wired in `globals.css` and follow the substrate.

## Imports

```tsx
import {
  surfaceClasses,
  surfaceHoverClasses,
  Elevated,
  SurfaceProvider,
  useSurface,
} from "@workspace/ui/components/sidebar"
// surfaceClasses / surfaceHoverClasses are also exported from the sidebar barrel.
```

Source: `packages/ui/src/lib/surface-classes.ts`, `surface-context.tsx`, `elevated.tsx`. Tokens defined in `packages/ui/src/styles/globals.css`.

## Tokens

Eight `bg-surface-N` / `shadow-surface-N` pairs (`N` ∈ `1..8`). Light mode flattens to white after step 2 — shadow alone carries elevation. Dark mode keeps adding white-opacity plus a layered shadow recipe, so the ladder is visible at every step.

The default substrate (the page itself) is **level 1**.

## `surfaceClasses(bgLevel, shadowLevel?)`

Look up the literal Tailwind classes for a given level pair. Same level for bg and shadow by default.

```tsx
<div className={cn(surfaceClasses(3), "rounded-xl p-4")}>
  Card at level 3
</div>
```

Fractional levels are clamped and rounded — `surfaceClasses(2.6)` returns the level 3 pair, not `"bg-surface- undefined"`.

### `surfaceHoverClasses(bgLevel, shadowLevel?)`

The hover counterpart — the level the surface rises to while the pointer is on it. Pair them when a card should respond visually to hover:

```tsx
const card = cn(
  surfaceClasses(2),
  surfaceHoverClasses(3),
  "rounded-xl p-4 transition-[background-color,box-shadow] duration-80",
)
```

`duration-80` is `0.08s` — match the `spring.fast` token.

## `<Elevated>`

The primitive that walks up the ladder automatically. Reads the surrounding substrate via `useSurface()`, applies `surfaceClasses(level, shadowLevel ?? level)`, and re-publishes its level so anything nested inside reads the right substrate.

```tsx
// Dropdown on the page: substrate is 1, level becomes 3 (offset +2)
<Elevated offset={2} className="rounded-xl p-4">
  <MenuItem>...</MenuItem>
</Elevated>

// Dialog on the page: offset +4 → level 5
<Elevated offset={4} className="rounded-2xl p-6">
  <DialogContent />
</Elevated>

// Popover inside a dialog (substrate 5): offset +2 → level 7
<Elevated offset={2} shadowLevel={3} className="rounded-xl">
  <Picker />
</Elevated>
```

### Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `offset` | `number` | — | Steps above the current substrate. Conventional: `2` for dropdown / popover / select menu, `4` for dialog / modal. |
| `shadowLevel` | `number` | computed level | Override for the shadow level. Pass a fixed value when the component should keep a constant shadow weight regardless of nesting depth (e.g. a dropdown always reads `shadow-surface-3` whether it opens on the page or inside a dialog, even though its background tracks the substrate). |

The component re-provides its computed level via `SurfaceProvider`, so anything inside — menus, list items, nested pickers — reads the right substrate without manual prop passing.

## `useSurface` and `SurfaceProvider`

Direct access to the substrate — useful when you need to compute a level yourself (e.g. a hover transition that lifts by a custom amount).

```tsx
const substrate = useSurface() // e.g. 1 on the page, 5 inside a dialog
return <div className={cn(surfaceClasses(substrate + 2), "...")} />
```

`SurfaceProvider` clamps to `[1, 8]` so an out-of-range value can never render `"bg-surface-9"` and break the cascade.

## Anti-patterns

- **Tailwind colors** (`bg-white`, `bg-zinc-900`, `dark:bg-zinc-900`) on a panel. Use `surfaceClasses(N)` so dark mode is automatic.
- **Prop-drilling the substrate** down the tree. Use `<Elevated>` — it walks the ladder for you.
- **Different shadow recipes per component**. Every surface shares the same eight tokens; consistency is the point.
- **Building nested Elevated layers with mismatched offsets** — a popover at `offset +3` inside a dialog at `offset +4` will hit the ceiling; pick offsets that add up cleanly (e.g. dialog +4, dropdown +2 → 7).

## Verification

1. `pnpm --filter @workspace/ui typecheck` — must pass.
2. Manual smoke: open a dialog with a nested picker, confirm both nest visibly in light and dark mode without changing colors by hand.
