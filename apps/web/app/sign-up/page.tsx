import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthShell, SignUpRedirectForm } from "@/features/auth"
import { SignUpSkeleton } from "./sign-up-skeleton"
import { getServerSession } from "@/lib/auth/server"

export const metadata = {
  title: "Crear cuenta — Asistant",
}

/**
 * `instant = false` — when an already-authenticated user visits
 * `/sign-up` we `redirect("/dashboard")`. Opts the segment out of
 * static-shell validation, matching the `/login` page above.
 */
export const instant = false

export default async function SignUpPage() {
  const session = await getServerSession()
  if (session) {
    redirect("/dashboard")
  }

  return (
    <AuthShell
      eyebrow="Crea tu cuenta"
      title="Empieza en piloto automático"
      subtitle="Crea tu workspace, conecta WhatsApp y deja que tu agente atienda a tus clientes 24/7."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Inicia sesión
          </Link>
        </>
      }
    >
      <Suspense fallback={<SignUpSkeleton />}>
        <SignUpRedirectForm />
      </Suspense>
    </AuthShell>
  )
}
