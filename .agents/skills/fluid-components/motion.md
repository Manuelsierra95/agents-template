# Motion

Three spring speeds (`fast` / `moderate` / `slow`), one rule for exits (a tier faster than entrances), and one fluid hover shared by every list. Every component animates with a token from `lib/springs` — no component invents its own timing, so things that have never been thought about together will move at the same pace.

## Imports

```tsx
import { spring, exitFallbackMs } from "@workspace/ui/components/sidebar"
// or directly:
// import { spring } from "@workspace/ui/lib/springs"
```

Source: `packages/ui/src/lib/springs.ts`.

## Tokens

| Token | Duration | Bounce | Use for |
|-------|----------|--------|---------|
| `spring.fast` | `0.08s` | `0` | Hover, focus rings, fades, input copy, slider thumbs, switch thumbs, table rows, card grid hover, combobox pop. |
| `spring.moderate` | `0.16s` | `0` | Dropdowns, tabs indicator, chat bubbles, mobile drawer, sidebar, **selection merge / split**, checkbox/radio transitions. |
| `spring.slow` | `0.24s` | `0.12` | Dialogs, drawers, ask-user questions, thinking steps. |

Every tier has a paired `.exit` variant **one tier faster** than the entrance, so an open modal that took `slow` closes on `slow.exit`. Don't hand-write the exit — pull `spring.<tier>.exit` directly.

`moderate` is **critically damped** (`bounce: 0`) — it lands exactly with no overshoot. That's intentional: dropdowns, tabs, drawers, and the merged-selection backgrounds must settle precisely. Don't add bounce to it.

## How to apply

```tsx
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 4, transition: spring.fast.exit }}
  transition={spring.fast}
/>
```

The pattern across the codebase is: `spring.<tier>` on enter, `spring.<tier>.exit` on exit. The `<AnimatePresence>` boundary owns the swap.

### Deferred unmount with `exitFallbackMs`

Popups keep their portal mounted until `onAnimationComplete` fires. A throttled or background tab can stall the animation — a fallback timer force-unmounts after the exit duration + a 100 ms safety buffer:

```ts
const id = setTimeout(() => setMounted(false), exitFallbackMs(spring.fast))
```

Always derive the timer from the same token the exit uses, so they stay in step.

## Where each tier is already used (current registry)

`fast` → focus rings, checkbox, radio, tooltip, table rows, card grid hover, input copy, slider, select, combobox, color picker, accordion.
`moderate` → dropdown, tabs indicator, switch thumb, chat bubbles, mobile drawer, sidebar, selection merge / split.
`slow` → dialog, ask-user questions, thinking steps.

When in doubt, look at the closest component in `packages/ui/src/components/` and copy its tier.

## Reduced motion

All springs respect the OS setting. Two ways to enable:

1. Wrap the app tree in `<MotionConfig reducedMotion="user">` — recommended for app shells.
2. Per-component, read `useReducedMotion()` and swap to `{ duration: 0 }` or a fade-only transition.

The fluid-hover highlight already does (2) internally — no `<MotionConfig>` needed for it.

## Anti-patterns

- **Hand-written CSS transitions** for state changes fluid components already animate (hover, popovers, sidebars). Reach for `spring` + `motion/react`.
- **Picking a duration in JSX** (`{ duration: 0.2 }`). Tokens live in `lib/springs.ts` so the system can change them in one place.
- **Adding `bounce: 0.2` to `moderate`** for "playfulness". Critically damped is the point.
- **Skipping the exit tier**. `spring.moderate` for entrance, `spring.moderate.exit` for exit. Always.

## Verification

1. `pnpm --filter @workspace/ui typecheck` — must pass.
2. Open any fluid component, toggle dark mode, and toggle reduced motion in OS settings — animations should flatten to opacity-only fades under reduced motion.
