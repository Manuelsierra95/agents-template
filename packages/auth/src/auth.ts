import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization } from "better-auth/plugins/organization"
import {
  db as defaultDb,
  session as sessionTable,
  eq,
  type DbClient,
} from "@workspace/db"
import { loadAuthConfig } from "@workspace/auth/config.ts"
import { getDefaultOrganizationId } from "@workspace/auth/membership.ts"

/**
 * Auto-provision a personal workspace for every newly-registered user,
 * and restore `activeOrganizationId` on every new session (sign-in).
 *
 * The hooks are implemented in two parts:
 *   1. `databaseHooks.user.create.after` — after sign-up, create the
 *      personal workspace (owner), then patch the just-created session
 *      with `activeOrganizationId`. (Session is created before the
 *      membership row exists, so the session hook alone cannot do this
 *      on first sign-up.)
 *   2. `databaseHooks.session.create.before` — on subsequent sign-ins,
 *      set `activeOrganizationId` from the user's memberships (prefer
 *      last-used, then owner, then any). Without this, new sessions are
 *      born with `activeOrganizationId = null` and org-scoped routes
 *      return 403.
 *
 * On any failure during sign-up provisioning, the hook attempts a
 * best-effort delete of the just-created user so we do not leave a
 * half-onboarded account.
 *
 * Naming: `${name}'s workspace` (falling back to the email's
 * local-part). Slug: `personal-<sanitised-local-part>-<userIdShort>`.
 * The `personal-` prefix is reserved by this module so the same
 *   re-registration pattern can never collide with a user-chosen
 *   workspace slug.
 */
const ORG_SLUG_PREFIX = "personal-"
const ORG_NAME_FALLBACK = "Personal workspace"

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "user"
}

function deriveWorkspaceName(user: { name?: string | null; email: string }): string {
  const base = (user.name?.trim() || user.email.split("@")[0] || "").slice(0, 64)
  return base ? `${base}'s workspace` : ORG_NAME_FALLBACK
}

function deriveWorkspaceSlug(user: { email: string; id: string }): string {
  const local = slugify(user.email.split("@")[0] ?? "")
  const tail = user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "u"
  return `${ORG_SLUG_PREFIX}${local}-${tail}`.slice(0, 48)
}

export function createAuth(opts?: {
  db?: DbClient
  secret?: string
  baseUrl?: string
  /**
   * Per-instance override for the `user` Better Auth option. Tests use
   * this to enable `deleteUser` (off by default). Production code passes
   * `undefined` so the default secure config is preserved.
   */
  user?: { deleteUser?: { enabled?: boolean } }
}) {
  const cfg = loadAuthConfig()
  const db: DbClient = opts?.db ?? defaultDb

  // Closure pattern: `auth` is assigned to the betterAuth() return value.
  // The `after` hook captures `auth` by reference; by the time the hook
  // runs (during a sign-up request), `auth` is fully constructed, so
  // `auth.api.createOrganization` is safe to call.
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: opts?.secret ?? cfg.AUTH_SECRET,
    baseURL: opts?.baseUrl ?? cfg.AUTH_BASE_URL,
    trustedOrigins: cfg.AUTH_TRUSTED_ORIGINS
      ? cfg.AUTH_TRUSTED_ORIGINS.split(",").map((s) => s.trim())
      : undefined,
    emailAndPassword: { enabled: true },
    ...(opts?.user ? { user: opts.user } : {}),
    plugins: [organization({})],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (session.activeOrganizationId) {
              return { data: session }
            }
            const organizationId = await getDefaultOrganizationId(session.userId, {
              client: db,
            })
            return {
              data: {
                ...session,
                activeOrganizationId: organizationId,
              },
            }
          },
        },
      },
      user: {
        create: {
          after: async (user, ctx) => {
            // Skip if the user somehow has no id (defensive — should
            // never happen because we are inside user.create.after).
            if (!user.id || !user.email) return
            try {
              const result = await auth.api.createOrganization({
                body: {
                  name: deriveWorkspaceName(user),
                  slug: deriveWorkspaceSlug(user),
                  userId: user.id,
                  keepCurrentActiveOrganization: false,
                },
              })
              // Better Auth returns a discriminated union; we only
              // care about the success branch which has an `id`.
              if (!("id" in result) || !result.id) {
                throw new Error("createOrganization returned no id")
              }
              // Set the just-created session as active in this
              // workspace. The `after` hook fires after the user
              // (and their sign-in session) is committed, so this
              // UPDATE will hit the row that the client will see in
              // the Set-Cookie.
              await db
                .update(sessionTable)
                .set({ activeOrganizationId: result.id })
                .where(eq(sessionTable.userId, user.id))
            } catch (err) {
              // Best-effort cleanup: delete the just-created user so
              // we never leave a half-onboarded account. We use the
              // internalAdapter (which accepts an arbitrary userId)
              // because the public `auth.api.deleteUser` is
              // session-scoped and meant for self-deletion. We ignore
              // any secondary failure (e.g. FK cascades) because the
              // alternative is a confusing inconsistent state.
              try {
                if (ctx?.context?.internalAdapter) {
                  await ctx.context.internalAdapter.deleteUser(user.id)
                } else {
                  // Fallback: drop the active org on existing sessions
                  // so the user can't be silently mapped to a no-longer
                  // existing workspace. This is best-effort only; in
                  // practice the only way to land here is an org
                  // creation failure with a session still in flight.
                  await db
                    .update(sessionTable)
                    .set({ activeOrganizationId: null })
                    .where(eq(sessionTable.userId, user.id))
                }
              } catch {
                // ignore
              }
              throw err
            }
          },
        },
      },
    },
    advanced: { database: { joins: true } },
  })

  return auth
}

export const auth = createAuth()
export type Auth = typeof auth