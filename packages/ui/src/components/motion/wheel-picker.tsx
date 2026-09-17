"use client";

import { useEffect, useRef } from "react";

import { cn } from "@workspace/ui/lib/utils.ts";

export interface WheelPickerProps {
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  visibleCount?: number;
  itemHeight?: number;
  className?: string;
  sound?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

export function WheelPicker({
  options,
  value,
  onValueChange,
  visibleCount = 3,
  itemHeight = 32,
  className,
  disabled,
  sound,
  ...rest
}: WheelPickerProps) {
  void sound;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const index = options.indexOf(value);
    if (index < 0 || !ref.current) return;
    ref.current.scrollTop = index * itemHeight;
  }, [value, options, itemHeight]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={rest["aria-label"]}
      className={cn(
        "h-full overflow-y-auto rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={{ height: visibleCount * itemHeight }}
    >
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onValueChange(option);
            }}
            className={cn(
              "flex w-full items-center justify-center text-sm outline-none transition-colors",
              selected
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
            style={{ height: itemHeight }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}