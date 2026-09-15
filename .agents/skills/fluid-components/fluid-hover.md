# Fluid Hover

A single hook + a single highlight component, reused by every list, menu, strip, and grid in `@workspace/ui`. The highlight glides between items on a transform — one element, one move, no blinking — instead of per-row CSS `:hover` toggling.

## When to use

Use `useFluidHover` + `FluidHoverHighlight` for **every** container of clickable items in this monorepo:

- Lists, menus, nav rows, sidebar items.
- Horizontal strips: tabs, segmented controls, chips.
- 2-D grids: card groups.

Skip when:

- A wrong click would hurt (destructive actions — leave them on a plain `:hover`).
- Only some of the items can be clicked (mixed-selectable cards).
- There's a lot of empty space between items.
- Rows change place as you scroll.

## Imports

```tsx
import {
  useFluidHover,
  FluidHoverHighlight,
  isDisabledRow,
} from "@workspace/ui/components/sidebar"
```

Underlying files: `packages/ui/src/hooks/use-fluid-hover.ts`, `packages/ui/src/components/fluid-hover-highlight.tsx`.

## Hook

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const hover = useFluidHover(containerRef, { axis: "y", isItemDisabled: isDisabledRow });
// hover.handlers    — spread on the container (onMouseMove / Enter / Leave)
// hover.registerItem — ref-callback for each row
// hover.activeIndex  — lit row, or null
// hover.itemRects    — ItemRect[] in container coords
// hover.isMeasured   — true once every registered item has a layout box
// hover.sessionRef   — current number, use as the highlight `session` prop
// hover.remeasure()  — invalidate rects after a layout change (popup open)
```

### Options

| Prop | Type | Default | Use for |
|------|------|---------|---------|
| `axis` | `"y" \| "x" \| "xy"` | `"y"` | Lists → `y`; tab strips → `x`; card grids → `xy`. |
| `isItemDisabled` | `(el: HTMLElement) => boolean` | — | Cheap predicate, called per mouse move. Returns true → row is skipped (never lit, never receives the gap click). `isDisabledRow` from `lib/popup.ts` covers `aria-disabled="true"` and `data-disabled`. |

**Index rules**: indices start at `0`, must stay stable for the lifetime of the list. Re-key the whole container when the list shape changes.

### Reducing bundle weight

If you don't need disabled-row support, skip the `isItemDisabled` callback — it's invoked on every mouse move.

## Highlight

```tsx
const { activeIndex, itemRects, isMeasured, sessionRef } = hover;
const rect = isMeasured && activeIndex !== null ? itemRects[activeIndex] : null;

return (
  <div ref={containerRef} className="relative" {...hover.handlers}>
    {/* rows */}
    <FluidHoverHighlight
      rect={rect}
      session={sessionRef.current}
      from={activeRow ? itemRects[activeRow] : null}
      className={`${shape.bg} z-10`}
    />
  </div>
);
```

### Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `rect` | `ItemRect \| null` | — | Pass `null` to fade out. |
| `session` | `number` | — | `sessionRef.current`. Re-keying fades in at `from ?? rect` instead of sliding over from the previous position. |
| `from` | `ItemRect \| null` | `rect` | Where a fresh session fades in from. A dropdown passes its checked row; a nav menu its active route. |
| `className` | `string` | — | Radius and z-index. Container must be `position: relative`. |
| `transition` | `Transition \| false` | `spring.fast` | The positional travel. Pass `false` to snap in place after a layout reflow that moved the rows. The opacity fade (0.08s) is always preserved. |

## Reduced motion

The highlight reads the OS media query directly (`useReducedMotion`), so a copied component honors reduced motion **without** wrapping the app in `<MotionConfig reducedMotion="user">`. Under reduced motion the position travel drops out — the highlight still fades in on the nearest row, it just stops sliding.

## Performance budget

One absolutely positioned element per container, animated on `transform` (one move per pointer event, no layout writes). A 200-row list stays well under a 16.7 ms frame.

## Verification

1. `pnpm --filter @workspace/ui typecheck` — must pass.
2. Manual smoke: rapid pointer moves over a list, focus-visible keyboard nav, dark mode, reduced-motion ON in OS settings.
