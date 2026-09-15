import type { ReactNode } from "react"
import { brandMesh } from "@/lib/brand-mesh"
import {
  Card,
  CardContent,
  CardEyebrow,
  CardHeader,
  CardImage,
  CardTitle,
} from "@workspace/ui/components"
import type { IconName } from "@workspace/ui/components/sidebar"
import { BrandFeatureItem } from "./brand-feature-item"

type Feature = {
  title: string
  description: string
  iconName: IconName
}

const FEATURES: readonly Feature[] = [
  {
    title: "Reservas 24/7",
    description:
      "Tu agente confirma citas en segundos, sin intervención humana.",
    iconName: "calendar-check",
  },
  {
    title: "Multi-canal",
    description: "WhatsApp, Instagram y web en una sola conversación continua.",
    iconName: "message-circle",
  },
  {
    title: "Multi-tenant",
    description:
      "Cada negocio con su espacio aislado, miembros y métricas propias.",
    iconName: "users",
  },
] as const

/**
 * Brand panel — the left half of the split-panel auth layout.
 *
 * Server Component: composes the project's signature `brandMesh` gradient as
 * a tall Card image, then lays the product name, value prop, and three
 * feature bullets on top. Reused verbatim by `/login` and `/sign-up` so the
 * two pages look identical at a glance.
 *
 * Hidden on small viewports — the form panel is the single column there.
 */
export function BrandPanel() {
  return (
    <aside
      aria-label="Asistant"
      className="relative hidden overflow-hidden bg-canvas md:flex md:flex-col md:justify-between md:p-12 lg:p-16"
    >
      <div className="relative z-10 flex flex-col gap-10">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-[10px] bg-foreground text-[15px] font-semibold text-background"
            style={{ fontVariationSettings: "'wght' 600, 'opsz' 22" }}
          >
            A
          </span>
          <span
            className="text-[16px] tracking-[-0.01em] text-foreground"
            style={{ fontVariationSettings: "'wght' 550, 'opsz' 18" }}
          >
            Asistant
          </span>
        </div>

        <Card
          size="compact"
          className="overflow-hidden rounded-2xl border border-line bg-surface-3 shadow-surface-2"
        >
          <CardImage
            src={brandMesh(1)}
            alt=""
            className="aspect-[16/9] w-full"
          />
          <CardHeader className="gap-1.5">
            <CardEyebrow>Piloto automático</CardEyebrow>
            <CardTitle className="text-[18px] tracking-[-0.015em]">
              WhatsApp + reservas con IA
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Un agente que entiende a tus clientes, agenda por ti y mantiene el
              contexto entre canales.
            </p>
          </CardContent>
        </Card>

        <ul className="flex flex-col gap-4">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <BrandFeatureItem feature={feature} />
            </li>
          ))}
        </ul>
      </div>

      <footer className="relative z-10 text-[12px] text-muted-foreground">
        © 2026 Asistant
      </footer>

      {/* A second, lower-intensity mesh behind the content so the empty
          space at the bottom of the panel breathes — the foreground card is
          the loud focal point; this layer just adds depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          backgroundImage: `url("${brandMesh(0.35)}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </aside>
  )
}

/** Wraps <BrandPanel>'s footer slot for callers that want to compose their own. */
export function BrandPanelFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="relative z-10 text-[12px] text-muted-foreground">
      {children}
    </footer>
  )
}
