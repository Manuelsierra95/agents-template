import { SignUpForm } from "./sign-up-form"

/**
 * Page-level wrapper for `/sign-up`.
 *
 * Server Component: passes the redirect target as a serializable prop
 * to the Client `SignUpForm`, which navigates on success. This keeps
 * `apps/web/app/sign-up/page.tsx` as a pure Server Component tree
 * with only the form itself carrying the client boundary.
 *
 * `SignUpForm` never navigates on its own when invoked from the
 * public landing page — the anonymous-chat claim flow
 * (`AuthRequiredPanel`) must stay on `/` so the conversation id
 * survives. This wrapper is the parent that owns routing for the
 * dedicated sign-up route.
 */
export function SignUpRedirectForm() {
  return <SignUpForm redirectTo="/dashboard" />
}