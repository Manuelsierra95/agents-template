# `@workspace/auth`

Better Auth + organization plugin, wrapped for the monorepo. Owns:

- The Better Auth instance (`auth` singleton + `createAuth({ db })` factory).
- The `requireAuth` Hono middleware (with `createRequireAuth(auth, { db })` for tests).
- The `requireRole(...)` Hono middleware.
- The `getMember(userId, organizationId, { client })` membership lookup.
- The `AuthContext` type (`{ user, session, organizationId, member }`).
- The role hierarchy (`owner` > `admin` > `member`) and `hasRole()` helper.

## Architecture

```text
@workspace/auth
   ├── auth.ts             # createAuth() factory + auth singleton
   ├── config.ts           # Zod env loader (AUTH_SECRET, AUTH_BASE_URL, AUTH_TRUSTED_ORIGINS)
   ├── membership.ts       # getMember(userId, organizationId, { client })
   ├── context/types.ts    # AuthContext, AuthUser, AuthSession, AuthMember
   ├── permissions/roles.ts # ROLE_HIERARCHY, hasRole()
   ├── middleware/
   │   ├── require-auth.ts # createRequireAuth() + requireAuth (default singleton)
   │   └── require-role.ts # requireRole(required)
   └── index.ts
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_SECRET` | yes | ≥ 32 chars. Rotated per environment. |
| `AUTH_BASE_URL` | yes | Public URL of the auth server (e.g. `http://localhost:4000`). |
| `AUTH_TRUSTED_ORIGINS` | no | Comma-separated list of allowed CORS origins for the auth endpoints. |

## Multi-tenancy

Tenant identity comes from the Better Auth `organization` plugin. The active organization for a session is `session.activeOrganizationId`. There is no separate `tenant_id` field anywhere — the canonical column for tenant ownership is `organization_id`.

### Authentication

`requireAuth` does the following on every request:

1. Reads the Better Auth session via the request headers (cookie-based).
2. Rejects with `401 UNAUTHORIZED` if there is no session.
3. Rejects with `403 FORBIDDEN` if `session.activeOrganizationId` is missing.
4. Resolves the membership via `getMember(userId, activeOrganizationId)`.
5. Rejects with `403 FORBIDDEN` if the user is not a member of the active organization.
6. Populates `c.set("auth", { user, session, organizationId, member })`.

After `requireAuth`, downstream code reads the context via:

```ts
const { user, organizationId, member } = c.get("auth")
```

The middleware never reads `X-Tenant-Id`, query parameters, or any client-supplied identifier. Tenant context comes exclusively from the validated session.

### Authorization

`requireRole("admin")` (or `"owner"`, `"member"`, or an array) reads the authenticated member and checks the role hierarchy. A missing auth context returns `401`; an insufficient role returns `403`.

```ts
app.use("/api/admin/*", requireAuth, requireRole("admin"))
```

`requireRole` does **not** call Better Auth or re-validate membership — it only reads `c.get("auth")`. Authentication (`requireAuth`) and authorization (`requireRole`) are separate concerns.

### AuthContext shape

```ts
type AuthContext = {
  user: User                  // row from Better Auth `user` table
  session: Session           // row from Better Auth `session` table
  organizationId: string      // canonical tenant id (== organization.id)
  member: Member             // row from Better Auth `member` table (carries `role`)
}
```

`organizationId` is the single field that downstream code reads to scope queries. It mirrors `member.organizationId` and is mirrored at the top level for ergonomics.

### Why client-supplied tenant identifiers are ignored

Client-supplied identifiers (`X-Tenant-Id`, `?tenantId=`, body fields named `organizationId`, URL segments) are **never** used to determine the active organization. Only `session.activeOrganizationId` is read, and only after a valid session cookie has authenticated the request.

This guarantees:

- A user cannot access data from an organization they are not a member of, even if they forge or manipulate identifiers.
- A user cannot "select" a tenant by sending a header.
- Cross-tenant data leaks are caught by the `organization_id` predicate that the repository adds to every query.

## API integration

Mount Better Auth's HTTP handler at `/api/auth/*` and protect the rest of the API with `requireAuth`:

```ts
import { Hono } from "hono"
import { requireAuth, requireRole } from "@workspace/auth"

const app = new Hono()
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.use("/api/private/*", requireAuth)
app.use("/api/admin/*", requireAuth, requireRole("admin"))
```

To bind to a custom DB client (tests, multi-tenant replicas):

```ts
import { createAuth, createRequireAuth } from "@workspace/auth"

const testAuth = createAuth({ db: testDb })
const testRequireAuth = createRequireAuth(testAuth, { db: testDb })
```

## What's NOT here

This package deliberately omits:

- OAuth providers.
- Email/password reset flows.
- 2FA.
- Organization invitations.
- Roles beyond `owner`, `admin`, `member`.
- Billing.

Add them by extending the Better Auth plugins list in `src/auth.ts`. They are out of scope for the template.
