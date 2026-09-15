"use client"

import { useIcon } from "@workspace/ui/components/sidebar"
import { shapeMap } from "@workspace/ui/lib/shape-context"

const shape = shapeMap.rounded

/**
 * Terms & privacy checkbox — a styled native checkbox paired with a
 * label that carries the two inline anchors (Términos, Política de
 * privacidad).
 *
 * Uses a native `<input type="checkbox">` rather than the Base UI
 * `Checkbox` primitive on purpose: this is a single, binary, no-fluid-hover
 * control, and apps/web does not depend on `@base-ui/react` directly
 * (the fluid CheckboxGroup in @workspace/ui does). Pulling a fresh
 * dep here just for one tickbox would be overkill.
 *
 * Visuals match the FF system: hairline border at rest, surface hover,
 * filled foreground when checked, focus-ring on the box.
 */
export function TermsCheckbox({
  checked,
  onCheckedChange,
  termsHref = "/legal/terms",
  privacyHref = "/legal/privacy",
  id,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  /** Both anchors default to placeholder routes until the legal pages land. */
  termsHref?: string
  privacyHref?: string
  id?: string
}) {
  const CheckIcon = useIcon("check")

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground select-none"
    >
      <span
        className={`relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center ${shape.bg} transition-colors duration-80 ${
          checked
            ? "bg-foreground text-background"
            : "bg-transparent shadow-[0_0_0_1px_var(--border),inset_0_0_0_0_var(--border)] hover:bg-hover"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          required
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Aceptar términos y política de privacidad"
        />
        {checked && <CheckIcon size={12} strokeWidth={2.5} />}
      </span>

      <span>
        Acepto los{" "}
        <a
          href={termsHref}
          className="font-medium text-foreground underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Términos
        </a>{" "}
        y la{" "}
        <a
          href={privacyHref}
          className="font-medium text-foreground underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Política de privacidad
        </a>
        .
      </span>
    </label>
  )
}
