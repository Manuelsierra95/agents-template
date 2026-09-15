/**
 * Hairline divider with a centred label, used between the email/password
 * block and the OAuth button so the visual hierarchy reads as two equal
 * alternatives rather than primary/secondary.
 *
 * Two `bg-border` rules — same token used by `Card` dividers — keep the
 * line weight consistent with the rest of the design system.
 */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground"
      style={{ fontVariationSettings: "'wght' 550, 'opsz' 14" }}
    >
      <span aria-hidden className="h-px flex-1 bg-border/60" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border/60" />
    </div>
  )
}
