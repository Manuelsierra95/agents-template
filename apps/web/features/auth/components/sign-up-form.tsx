"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import { Button } from "@workspace/ui/components/button"
import { InputGroup, InputField } from "@workspace/ui/components/input-group"
import { useIcon } from "@workspace/ui/components/sidebar"
import { AuthDivider } from "@/features/auth/components/auth-divider"
import { GoogleButton } from "@/features/auth/components/google-button"
import { TermsCheckbox } from "@/features/auth/components/terms-checkbox"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Status = "idle" | "loading" | "error"

/**
 * Email + password + name sign-up form.
 *
 * Mirrors `LoginForm` with an extra `name` field and a Terms & Privacy
 * checkbox. Calls `authClient.signUp.email`; the auto-provisioned personal
 * workspace is created **server-side** by
 * `packages/auth/src/auth.ts` via `databaseHooks.user.create.after`.
 *
 * Submit is blocked until name + email look valid, password ≥ 8 chars, and
 * the terms checkbox is ticked.
 */
export function SignUpForm({
  onSuccess,
  redirectTo,
}: {
  /**
   * Optional callback invoked after a successful sign-up.
   * Wins over `redirectTo` when both are provided.
   */
  onSuccess?: () => void
  /**
   * Optional path to navigate to after a successful sign-up.
   * Used by the dedicated `/sign-up` route via `SignUpRedirectForm`.
   */
  redirectTo?: string
}) {
  const router = useRouter()
  const UserIcon = useIcon("user")
  const MailIcon = useIcon("mail")
  const LockIcon = useIcon("lock")

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = password.length >= 8
  const nameValid = name.trim().length >= 1
  const canSubmit =
    emailValid &&
    passwordValid &&
    nameValid &&
    acceptedTerms &&
    status !== "loading"

  const nameError =
    name.length > 0 && !nameValid ? "Introduce tu nombre." : undefined
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
    const { error } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "No pudimos crear la cuenta.")
      return
    }
    setStatus("idle")
    if (onSuccess) {
      onSuccess()
    } else if (redirectTo) {
      router.replace(redirectTo)
    }
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
          label="Nombre"
          placeholder="Cómo te llamas"
          icon={UserIcon}
          index={0}
          value={name}
          onChange={(v) => {
            setName(v)
            resetError()
          }}
          autoComplete="name"
          error={nameError}
          required
        />
        <InputField
          label="Correo"
          placeholder="tu@email.com"
          icon={MailIcon}
          index={1}
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
          index={2}
          value={password}
          onChange={(v) => {
            setPassword(v)
            resetError()
          }}
          type="password"
          autoComplete="new-password"
          error={passwordError}
          required
          minLength={8}
        />
      </InputGroup>

      <TermsCheckbox
        id="signup-terms"
        checked={acceptedTerms}
        onCheckedChange={setAcceptedTerms}
      />

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
        {status === "loading" ? "Creando cuenta…" : "Crear cuenta"}
      </Button>

      <AuthDivider label="o continúa con" />

      <GoogleButton label="Registrarse con Google" />
    </form>
  )
}
