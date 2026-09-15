# Scrollbars

A scrollbar that stays out of the way but never disappears, plus shadcn's scroll-fade as the baseline edge treatment — restyled to the shape system, with native overflow scrolling on touch-primary devices.

## When to use

Use `ScrollArea` for **every** overflow container in the app — clipped lists, code blocks, settings panels, long tables, sidebars. Raw `<div className="overflow-auto">` is forbidden where `ScrollArea` exists.

Use the `scroll-fade` (vertical) or `scroll-fade-x` (horizontal) CSS utility on the viewport whenever you want the content to dissolve toward an edge with more to scroll.

## Imports

```tsx
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
// ScrollArea is also re-exported from the sidebar barrel.
```

Source: `packages/ui/src/components/scroll-area.tsx`. The scroll-fade utilities live in `packages/ui/src/styles/globals.css`.

## Component

Built on `@base-ui/react/scroll-area`. The thumb rests narrow and low-contrast, then widens + darkens on hover so it gets out of the way until you reach for it. Track radius follows the shape system (`useShape().bg`).

On **touch-primary** devices the Base UI machinery is skipped entirely in favor of native `overflow: auto` — platform physics beat any custom scrollbar, and the gesture is the right affordance. `useTouchPrimary` handles the switch.

### Props

| Prop | Type | Default | Use for |
|------|------|---------|---------|
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"` | Vertical list, horizontal strip, or double overflow. `"both"` adds a corner. |
| `viewportClassName` | `string` | — | Goes on the inner scrolling viewport — drop `scroll-fade` or `scroll-fade-x` here. |
| `className` | `string` | — | Outer container — set the height / width constraint here. |

### Examples

```tsx
// Vertical list with fade at top + bottom
<ScrollArea className="h-72" viewportClassName="scroll-fade">
  {items.map(...)}
</ScrollArea>

// Horizontal strip
<ScrollArea orientation="horizontal" className="w-full" viewportClassName="scroll-fade-x">
  {months.map(...)}
</ScrollArea>

// Double overflow (taller and wider than box)
<ScrollArea orientation="both" className="h-72 w-full">
  <Table>...</Table>
</ScrollArea>
```

## Scroll-fade utility

A mask-image utility vendored from shadcn's scroll-fade, in `globals.css`. A mask dissolves the content toward the edges that have more to scroll, and a scroll-driven animation keeps the true start and end crisp. Drop `scroll-fade` (or `scroll-fade-x`) on the **viewport** and it rides under the scrollbar — no JavaScript, no extra component.

Two flavors:

- `.scroll-fade` — vertical fade (top + bottom).
- `.scroll-fade-x` — horizontal fade (left + right).

The fade size is tunable via `--scroll-fade-size` on the element (default `48px`). The popup lib overrides it to `32px` because popups sit closer to their trigger.

## Anti-patterns

- **`<div className="overflow-auto">`** for any list or panel. Use `ScrollArea`.
- **Inline-styled scrollbar colors**. Shape and surface tokens already drive the thumb.
- **Putting `scroll-fade` on the outer `ScrollArea`**. It goes on the `viewportClassName` — the mask needs to track the scrolling content.

## Verification

1. `pnpm --filter @workspace/ui typecheck` — must pass.
2. Manual smoke: scroll a list with the wheel, then with the trackpad; hover the scrollbar to verify it widens; switch to a touch device (or DevTools touch emulation) to verify native overflow.
