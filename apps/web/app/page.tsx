import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Asistant Agents — WhatsApp + reservas con IA",
  description:
    "SaaS multi-tenant para negocios que atienden clientes por WhatsApp y gestionan reservas con un agente IA.",
}

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-ink text-canvas">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="text-sm font-semibold text-ink">Template</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-ink-2 hover:text-ink">
              Iniciar sesión
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas hover:opacity-90"
            >
              Empezar gratis
            </Link>
          </nav>
        </div>
      </header>
    </main>
  )
}
