import type { ReactNode } from "react"
import { BrandPanel } from "@/features/auth/components/brand-panel"

/**
 * Split-panel layout shared by `/login` and `/sign-up`.
 *
 * Two-column grid on `md+`: brand panel on the left, form panel on the right.
 * The brand panel is hidden under `md` so the page degrades to a single
 * column on phones without breaking the panel's relative-positioned layers.
 *
 * `eyebrow` is the small uppercase tracking-wide label that introduces the
 * form (e.g. "Inicia sesión", "Crea tu cuenta"). `title` is the form heading
 * in the display role, and `subtitle` is the muted lead text below it.
 *
 * `children` is the form itself (a Client Component). `footer` is the
 * cross-link to the other auth page ("¿No tienes cuenta? →").
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="grid min-h-dvh bg-canvas md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <BrandPanel />

      <section className="flex items-center justify-center px-6 py-12 md:px-10 md:py-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <header className="flex flex-col gap-2">
            <span
              className="text-[11px] uppercase tracking-wide text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 550, 'opsz' 14" }}
            >
              {eyebrow}
            </span>
            <h1
              className="text-[26px] tracking-[-0.02em] text-foreground"
              style={{ fontVariationSettings: "'wght' 550, 'opsz' 22" }}
            >
              {title}
            </h1>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          </header>

          {children}

          {footer && (
            <p className="text-center text-[12.5px] text-muted-foreground">
              {footer}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
