"use client";

import { GooDropdown } from "@workspace/ui/components/ui/goo-dropdown";
import { WheelPicker } from "@workspace/ui/components/motion/wheel-picker";
import { cn } from "@workspace/ui/lib/utils";

import { usePreferences } from "./preferences-context";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const HOURS_24 = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTE_STEP = 15;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
  String(i * MINUTE_STEP).padStart(2, "0"),
);
const MERIDIEM = ["AM", "PM"];

const END_OF_DAY = 24 * 60;

type Mode = "start" | "end";

interface TimeParts {
  hour: string;
  minute: string;
  meridiem: string;
}

function minutesToParts(minutes: number, use24h: boolean): TimeParts {
  if (minutes >= END_OF_DAY) {
    return { hour: use24h ? "00" : "12", minute: "00", meridiem: "AM" };
  }
  const clamped = Math.max(0, minutes);
  const h24 = Math.floor(clamped / 60);
  const minute = Math.min(
    Math.round((clamped % 60) / MINUTE_STEP) * MINUTE_STEP,
    60 - MINUTE_STEP,
  );
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    hour: use24h ? String(h24).padStart(2, "0") : String(h12),
    minute: String(minute).padStart(2, "0"),
    meridiem,
  };
}

function partsToMinutes(
  parts: TimeParts,
  mode: Mode,
  use24h: boolean,
): number {
  const atMidnight =
    parts.minute === "00" &&
    (use24h
      ? parts.hour === "00"
      : parts.hour === "12" && parts.meridiem === "AM");
  if (mode === "end" && atMidnight) return END_OF_DAY;
  if (use24h) return Number(parts.hour) * 60 + Number(parts.minute);
  const h12 = Number(parts.hour) % 12;
  const h24 = parts.meridiem === "PM" ? h12 + 12 : h12;
  return h24 * 60 + Number(parts.minute);
}

function formatLabel(minutes: number, use24h: boolean): string {
  const { hour, minute, meridiem } = minutesToParts(minutes, use24h);
  return use24h ? `${hour}:${minute}` : `${hour}:${minute} ${meridiem}`;
}

const WHEEL_CLASS = "w-14 border-transparent bg-transparent";

export function TimeField({
  value,
  onChange,
  mode = "start",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (minutes: number) => void;
  mode?: Mode;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { use24h } = usePreferences();
  const parts = minutesToParts(value, use24h);
  const setPart = (key: keyof TimeParts, part: string) =>
    onChange(partsToMinutes({ ...parts, [key]: part }, mode, use24h));

  const wheels = (
    <div className="flex h-full items-center justify-center gap-1">
      <WheelPicker
        options={use24h ? HOURS_24 : HOURS}
        value={parts.hour}
        onValueChange={(v) => setPart("hour", v)}
        visibleCount={5}
        itemHeight={32}
        className={WHEEL_CLASS}
        aria-label="Hour"
      />
      <WheelPicker
        options={MINUTES}
        value={parts.minute}
        onValueChange={(v) => setPart("minute", v)}
        visibleCount={5}
        itemHeight={32}
        className={WHEEL_CLASS}
        aria-label="Minute"
      />
      {!use24h && (
        <WheelPicker
          options={MERIDIEM}
          value={parts.meridiem}
          onValueChange={(v) => setPart("meridiem", v)}
          visibleCount={5}
          itemHeight={32}
          className={WHEEL_CLASS}
          aria-label="AM or PM"
        />
      )}
    </div>
  );

  return (
    <GooDropdown
      trigger={formatLabel(value, use24h)}
      triggerLabel={ariaLabel}
      panelContent={wheels}
      contentHeight={132}
      triggerSound={false}
      disabled={disabled}
      menuLabel={ariaLabel ?? "Select a time"}
      side="top"
      align="start"
      gap={8}
      width={use24h ? 148 : 196}
      buttonRadius={16}
      panelRadius={20}
      fill="color-mix(in oklch, var(--foreground) 7%, var(--popover))"
      foreground="var(--foreground)"
      hoverFill="var(--accent)"
      triggerClassName="w-full tabular-nums"
      className={cn(
        "flex-1",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    />
  );
}
