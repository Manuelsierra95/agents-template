# Sizes

Two component sizes — a 36px default and a 28px compact. Density is a **region** decision, not a per-control one: wrap the region in a `SizeProvider` and everything inside follows, menus included (React context crosses portals).

## When to use

- **Default (36px)** is the right call for everything else — page-level controls, dialogs, forms, marketing surfaces.
- **Compact (28px)** is for dense, data-heavy tools — filter bars, toolbars, table headers, sidebars.

Mixing sizes within a single control row reads as a bug. Pick one step per region and let the whole region follow.

## Imports

```tsx
import {
  SizeProvider,
  useSize,
  useSizeVariant,
  useSizeContext,
  useTypeScale,
  sizeMap,
  typeScale,
  type SizeVariant,
  type SizeClasses,
  type TypeScaleRole,
} from "@workspace/ui/components/sidebar"
// or directly:
// import { SizeProvider, useSize, ... } from "@workspace/ui/lib/size-context"
```

Source: `packages/ui/src/lib/size-context.tsx`.

## Provider

```tsx
<SizeProvider defaultSize="compact">
  <FilterBar /> {/* every control inside follows */}
</SizeProvider>
```

### Props

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `size` | `"default" \| "compact"` | — | Controlled — pin the whole region. Overrides internal state. |
| `defaultSize` | `"default" \| "compact"` | `"default"` | Uncontrolled initial variant. Swappable at runtime via `useSizeContext().setSize`. |

The controlled `size` prop makes a background write to the internal state, which would pop back out if `size` were later removed — the provider swallows `setSize` when controlled. Toggle via the prop, not via context.

## Per-component override

Almost every sized primitive accepts a `size` prop that wins over the surrounding provider: `Button`, `Badge`, `Select`, `Tabs`, `TabsSubtle`, `Dropdown`, `DropdownMenu`, `CheckboxGroup`, `RadioGroup`, `InputGroup`, `InputCopy`, `InputMessage`, `Table`, `Switch`, `Slider`, `Accordion`, `AccordionGroup`, `AskUserQuestions`, `Card`, `ChatMessage`, `ColorPicker`, `ThinkingIndicator`, `ThinkingSteps`.

Use it for a single outlier inside a region, never for whole regions — that's what the provider is for.

## Tokens

| Token | Default | Compact | Applies to |
|-------|---------|---------|------------|
| `control` | `h-9` (36px) | `h-7` (28px) | Bounded controls AND list/menu rows (select options, dropdown, checkbox, radio) — shared by design so a popup row lines up with its trigger. |
| `segmentItem` | `h-7` (28px) | `h-6` (24px) | Tab trigger inside a padded segmented list. |
| `segmentPad` | `p-1` (4px) | `p-0.5` (2px) | Padding of the segmented list around its tabs. (`segmentItem + segmentPad` always re-adds to `control`.) |
| `text` | `14px` | `14px` | Labels inside controls (sidebar, nav, buttons, inputs — one reading size across the app). |
| `icon` | `16px` | `14px` | Leading / trailing icons, checkbox square, radio circle. |
| `px` | `12px` | `10px` | Horizontal padding of bounded controls. |
| `itemPx` | `8px` | `6px` | Horizontal padding of list / menu rows. |
| `gap` | `8px` | `4px` | Icon-to-label and control-to-control gap. |

The numeric counterparts (`controlHeight`, `icon`, `bgRadius` on shape, etc.) are exported for consumers that need raw pixels — e.g. for the slider knob to position itself.

## Type scale

| Role | Default | Compact | Used for |
|------|---------|---------|----------|
| `hero` | 48px | 40px | Landing / marketing surfaces. |
| `display` | 28px | 24px | Page titles. |
| `title` | 16px | 15px | Section headings, dialog titles. |
| `subtitle` | 14px | 13px | Card titles, chat bubbles, emphasized rows. |
| `body` | 14px | 14px | Control labels, body copy, sidebar / nav / button / input text. |
| `caption` | 13px | 12px | Secondary text — descriptions, helper text, muted body, errors. |
| `meta` | 12px | 11px | Small metadata — timestamps, fine print, eyebrow / overline labels. |

The native heading ramp lives in `globals.css` (h1 → h6: 48 → 36 → 28 → 22 → 18 → 16) and pairs with these roles — `<h1>` ≈ `hero`, `<h3>` ≈ `display`, `<h6>` ≈ `title`.

Use `useTypeScale()` inside a component if you render page-level copy and want it to follow the ladder step:

```tsx
const t = useTypeScale()
return <h1 style={{ fontSize: t.display }}>{title}</h1>
```

Compact steps `caption` and `meta` down one notch so dense regions read as a smaller sibling of the same hierarchy; `body` stays at 14px in both steps so every interactive surface (sidebar, buttons, inputs) reads at one consistent size across the whole app.

## Anti-patterns

- **Hardcoding `h-9` or `text-[13px]`** on a custom control. Use `useSize()` and pull `classes.control` / `classes.text`.
- **Per-control size toggling** instead of a region provider.
- **Setting `compact` for marketing surfaces** — it reads as cramped, not crisp.

## Verification

1. `pnpm --filter @workspace/ui typecheck` — must pass.
2. Manual smoke: wrap a region in `SizeProvider`, verify menus inherit (open a select inside, the option row height matches the trigger).
