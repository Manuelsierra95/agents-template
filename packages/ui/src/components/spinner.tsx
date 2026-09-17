"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

const Spinner = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { size?: number }
>(({ className, size = 16, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="spinner"
    role="status"
    aria-label="Loading"
    className={cn("inline-block animate-spin", className)}
    {...props}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size }}
    >
      <title>Loading</title>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  </span>
));
Spinner.displayName = "Spinner";

export { Spinner };
