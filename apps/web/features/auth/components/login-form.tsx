"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import { Button } from "@workspace/ui/components/button"
import { InputGroup, InputField } from "@workspace/ui/components/input-group"
import { useIcon } from "@workspace/ui/components/sidebar"
import { AuthDivider } from "@/features/auth/components/auth-divider"
import { GoogleButton } from "@/features/auth/components/google-button"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = "idle" | "loading" | "error"

/**
 * Email + password login form.
 *
 * - Uses `InputGroup` + `InputField` (the project's fluid inputs) so each
 *   field gets the fluid hover highlight, the focused-state ring, and the
 *   label-thickness animation for free.
 * - Submit is disabled until both fields look valid.
 * - Calls `authClient.signIn.email` which posts to `/api/auth/sign-in/email`.
 *   Better Auth sets the session cookie on success.
 * - On success → `router.replace("/dashboard")`.
 * - On error → inline error message (no full page reload, no `localStorage`).
 */
export function LoginForm() {
  const router = useRouter()
  const MailIcon = useIcon("mail")
  const LockIcon = useIcon("lock")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = password.length >= 8
  const canSubmit = emailValid && passwordValid && status !== "loading"

  const emailError =
    email.length > 0 && !emailValid ? "Introduce un correo válido." : undefined
  const passwordError =
    password.length > 0 && !passwordValid
      ? "La contraseña debe tener al menos 8 caracteres."
      : undefined

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setStatus("loading")
    setErrorMessage(null)
    const { error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Correo o contraseña incorrectos.")
      return
    }
    setStatus("idle")
    router.replace("/dashboard")
  }

  function resetError() {
    if (status === "error") {
      setStatus("idle")
      setErrorMessage(null)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <InputGroup className="w-full gap-3">
        <InputField
          label="Correo"
          placeholder="tu@email.com"
          icon={MailIcon}
          index={0}
          value={email}
          onChange={(v) => {
            setEmail(v)
            resetError()
          }}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={emailError}
          required
        />
        <InputField
          label="Contraseña"
          placeholder="Mínimo 8 caracteres"
          icon={LockIcon}
          index={1}
          value={password}
          onChange={(v) => {
            setPassword(v)
            resetError()
          }}
          type="password"
          autoComplete="current-password"
          error={passwordError}
          required
          minLength={8}
        />
      </InputGroup>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="text-[12px] text-destructive"
          style={{ animation: "fade-in 150ms ease-out both" }}
        >
          {errorMessage}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={!canSubmit} className="w-full">
        {status === "loading" ? "Iniciando sesión…" : "Iniciar sesión"}
      </Button>

      <AuthDivider label="o continúa con" />

      <GoogleButton />
    </form>
  )
}
