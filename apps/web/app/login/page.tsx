import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthShell, LoginForm } from "@/features/auth"
import { LoginSkeleton } from "@/app/login/login-skeleton"
import { getServerSession } from "@/lib/auth/server"

export const metadata = {
  title: "Iniciar sesión — Asistant",
}

export default async function LoginPage() {
  const session = await getServerSession()
  if (session) {
    redirect("/dashboard")
  }

  return (
    <AuthShell
      eyebrow="Inicia sesión"
      title="Vuelve a tu workspace"
      subtitle="Continúa donde lo dejaste: tus reservas, conversaciones y configuración te están esperando."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Crea una
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
