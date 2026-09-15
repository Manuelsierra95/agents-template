"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

type SizeVariant = "default" | "compact";

interface SizeClasses {
  /** The variant these classes belong to — handy for conditionals. */
  variant: SizeVariant;
  /** Bounded control height — buttons, inputs, select triggers, subtle tabs —
   *  AND list/menu rows (select options, dropdown, checkbox and radio rows).
   *  One token by design: a popup row lines up with the trigger that opened
   *  it because they share this height. */
  control: string;
  /** `control` as a number, for consumers that need raw pixels. */
  controlHeight: number;
  /** Tab trigger height inside a padded segmented list. Sized so
   *  `segmentPad` + `segmentItem` adds back up to the control height —
   *  the segmented control's outer box stays on the same ladder. */
  segmentItem: string;
  /** Padding of the segmented list around its tabs. */
  segmentPad: string;
  /** Body text inside controls. */
  text: string;
  /** Horizontal padding of bounded controls (select trigger, inputs). */
  px: string;
  /** Horizontal padding of list/menu rows, which sit inside a padded popup
   *  or group and need less inset than a bounded control. */
  itemPx: string;
  /** Gap between an icon / control glyph and its label, and between
   *  neighbouring controls in a row (toolbars, filter bars, button
   *  clusters). Density is spacing as much as control height, so the
   *  compact step halves it. */
  gap: string;
  /** Glyph size in px: leading/trailing icons inside controls, and the
   *  checkbox square / radio circle. */
  icon: number;
}

const sizeMap: Record<SizeVariant, SizeClasses> = {
  // 36px — the default control height. Matches a 14px label with comfortable
  // breathing room and keeps controls a workable pointer target.
  default: {
    variant: "default",
    control: "h-9",
    controlHeight: 36,
    segmentItem: "h-7",
    segmentPad: "p-1",
    text: "text-[14px]",
    px: "px-3",
    itemPx: "px-2",
    gap: "gap-2",
    icon: 16,
  },
  // 28px — the compact height for dense surfaces: filter bars, toolbars,
  // table headers, sidebars. The control box shrinks (28px / 14px icon) but
  // text stays at 14px so every interactive surface in the app — sidebar,
  // buttons, inputs — reads at one consistent reading size.
  compact: {
    variant: "compact",
    control: "h-7",
    controlHeight: 28,
    segmentItem: "h-6",
    segmentPad: "p-0.5",
    text: "text-[14px]",
    px: "px-2.5",
    itemPx: "px-1.5",
    gap: "gap-1",
    icon: 14,
  },
};

/** One role of the type scale: px per ladder step. */
interface TypeScaleStep {
  default: number;
  compact: number;
}

/**
 * Role-based type scale, per ladder step (px values).
 *
 * The default column is the system as shipped; the compact column steps each
 * role down one notch so dense regions read as a smaller sibling of the same
 * hierarchy, not a squeezed copy. `body`, `caption`, `meta`, and `subtitle`
 * are what the sized components already render through `SizeClasses.text`
 * and their compact conditionals; `title`, `display` and `hero` are the
 * page-level roles for consumers composing their own screens.
 *
 * Reading sizes:
 *  - 14px  body / sidebar / nav / buttons / inputs / prominent body copy
 *  - 13px  caption — secondary copy, descriptions, helper text
 *  - 12px  meta — timestamps, fine metadata, eyebrows, badges
 *  - 16px  title — section headings, dialog titles
 *  - 28px  display — page titles
 *  - 48px  hero — landing / marketing surfaces (see globals.css heading ramp
 *           for the full h1..h6 progression 48 → 36 → 28 → 22 → 18 → 16)
 */
const typeScale = {
  /** Landing-page hero / marketing surfaces. Largest heading role. */
  hero: { default: 48, compact: 40 },
  /** Page titles. */
  display: { default: 28, compact: 24 },
  /** Section headings, dialog titles. */
  title: { default: 16, compact: 15 },
  /** Card titles, chat bubbles, emphasized rows. */
  subtitle: { default: 14, compact: 13 },
  /** Control labels and body copy — `SizeClasses.text`. Stays at 14px in
   *  compact regions so interactive surfaces (sidebar, buttons, inputs)
   *  read at one consistent size across the whole app. */
  body: { default: 14, compact: 14 },
  /** Secondary text: descriptions, helper text, muted body, errors. */
  caption: { default: 13, compact: 12 },
  /** Small metadata: timestamps, badges, fine print — `text-xs` territory. */
  meta: { default: 12, compact: 11 },
} as const satisfies Record<string, TypeScaleStep>;

type TypeScaleRole = keyof typeof typeScale;

/** The type scale resolved for the active ladder step (px per role):
 *  explicit override > surrounding SizeProvider > "default". */
function useTypeScale(
  override?: SizeVariant | null
): Record<TypeScaleRole, number> {
  const variant = useSizeVariant(override);
  return {
    hero: typeScale.hero[variant],
    display: typeScale.display[variant],
    title: typeScale.title[variant],
    subtitle: typeScale.subtitle[variant],
    body: typeScale.body[variant],
    caption: typeScale.caption[variant],
    meta: typeScale.meta[variant],
  };
}

interface SizeContextValue {
  size: SizeVariant;
  setSize: (size: SizeVariant) => void;
  classes: SizeClasses;
}

const SizeContext = createContext<SizeContextValue | null>(null);

/** Resolve the active size variant: explicit prop > provider > "default". */
function useSizeVariant(override?: SizeVariant | null): SizeVariant {
  const ctx = useContext(SizeContext);
  return override ?? ctx?.size ?? "default";
}

/** Resolve size classes: explicit prop > provider > "default". */
function useSize(override?: SizeVariant | null): SizeClasses {
  return sizeMap[useSizeVariant(override)];
}

function useSizeContext() {
  const ctx = useContext(SizeContext);
  if (!ctx) throw new Error("useSizeContext must be used within a SizeProvider");
  return ctx;
}

function SizeProvider({
  children,
  size,
  defaultSize = "default",
}: {
  children: ReactNode;
  /** Controlled variant — pin a whole region to one size (e.g. a compact
   *  filter bar). Overrides internal state. */
  size?: SizeVariant;
  defaultSize?: SizeVariant;
}) {
  const [internalSize, setInternalSize] = useState<SizeVariant>(defaultSize);
  const isControlled = size !== undefined;
  const resolved = size ?? internalSize;

  // Controlled providers ignore setSize entirely — a background write to the
  // shadowed internal state would pop back out if the size prop were later
  // removed.
  const setSize = useCallback(
    (next: SizeVariant) => {
      if (isControlled) return;
      setInternalSize(next);
    },
    [isControlled]
  );

  const value = useMemo(
    () => ({ size: resolved, setSize, classes: sizeMap[resolved] }),
    [resolved, setSize]
  );

  return <SizeContext.Provider value={value}>{children}</SizeContext.Provider>;
}

export {
  SizeProvider,
  useSize,
  useSizeVariant,
  useSizeContext,
  useTypeScale,
  sizeMap,
  typeScale,
};
export type { SizeVariant, SizeClasses, TypeScaleRole, TypeScaleStep };
