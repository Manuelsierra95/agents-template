# apps/api — Hono backend

Multi-tenant API. Owns all DB writes; the Eve agent and the web client talk to it via HTTP.

## Routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Healthcheck. |
| ALL | `/eve/*` | Pass-through proxy to Eve runtime (`apps/agent`). Injects `Authorization: Bearer ${INTERNAL_API_TOKEN}` on every upstream request. Streams Eve's NDJSON response back unchanged. |
| ALL | `/api/auth/*` | Better Auth handler. |
| GET | `/api/me` | Current session + org + role. |
| GET / PATCH | `/api/businesses/me` | Tenant business profile. |
| GET / POST / PATCH / DELETE | `/api/services` | Services CRUD. |
| GET / POST / PATCH | `/api/staff` | Staff CRUD. |
| GET / POST / PATCH | `/api/customers` | Customer CRM. |
| GET / POST / PATCH | `/api/appointments` | Appointments CRUD. |
| GET | `/api/appointments/availability` | Free slots. |
| GET / PATCH | `/api/booking-rules` | Booking rules. |
| GET / PUT | `/api/business-hours` | Weekly hours. |
| GET / POST | `/api/conversations` | Customer conversations. |
| GET | `/api/conversations/:id` | Conversation + messages. |
| POST | `/api/conversations/:id/simulate-inbound` | Stream NDJSON of inbound message + Eve reply. |
| GET / PATCH | `/api/agent-configurations` | Per-tenant agent config. |
| GET / PATCH | `/api/agents/:id` | Per-org agent enable/disable. |
| GET / POST | `/api/whatsapp` | WhatsApp connection state. |
| GET | `/api/integrations` | Integrations list. |
| ALL | `/api/internal/*` | Server-to-server namespace. Every route is gated by `requireInternalToken` — only `apps/agent` (and any future service caller) can reach them. No browser session cookie path; only the bearer token. |

## Multi-tenancy contract

- `requireAuth` is wired on every tenant-owned route via `createApp({ db, requireAuth })`.
- Every repository accepts `organizationId` as a parameter and adds `eq(table.organizationId, organizationId)` to its queries.
- `client-supplied identifiers are ignored` — the canonical tenant is `session.activeOrganizationId`.

## Conversation simulator

`POST /api/conversations/:id/simulate-inbound` accepts `{ text }` and:

1. Persists the inbound text as `conversation_messages` (`direction=inbound`, `kind=text`).
2. Forwards `text` to Eve via the existing `eveSessionId`.
3. Streams NDJSON of Eve events. Each event is persisted as a `conversation_messages` row (`direction=outbound`, `kind=text|tool_call|tool_result`).
4. Closes the stream on `session.waiting` / `session.completed` / `session.failed`.

This same flow will be wired to the WhatsApp webhook without changes — only the upstream message source differs.

## Local development

```bash
pnpm --filter api dev
```

Copy `apps/api/.env.example` to `apps/api/.env` (gitignored) and fill
the secrets. `AUTH_SECRET` and `INTERNAL_API_TOKEN` must be ≥ 32 chars;
generate them with `openssl rand -hex 32`. `INTERNAL_API_TOKEN` must
match the value carried by `apps/agent/.env`.
