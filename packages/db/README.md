# @workspace/db

PostgreSQL + Drizzle ORM. Owns the canonical schema for the SaaS.

## Tables

### Better Auth core (do not modify)

`user`, `session`, `account`, `verification`, `organization`, `member`,
`invitation`, `jwks`. Any change to these comes from the Better Auth CLI,
not from this package.

### SaaS domain

| Table | Purpose |
| --- | --- |
| `businesses` | Tenant profile (1:1 with `organization`). |
| `services` | Services offered by the tenant. |
| `staff` | Professionals. |
| `staff_services` | M:N staff ↔ services. |
| `business_hours` | Weekly hours (business-wide or per-staff). |
| `booking_rules` | Lead time, cancellation window, etc. |
| `customers` | Mini-CRM contacts. |
| `appointments` | Bookings. |
| `appointment_events` | Audit trail per appointment. |
| `agents` | Catalog of platform agents. |
| `agent_configurations` | Per-organization agent config (identity, tone, capabilities, knowledge). |
| `customer_conversations` | Conversation between a customer and the agent. |
| `conversation_messages` | Append-only log of messages + tool events. |
| `whatsapp_connections` | Per-org WhatsApp Business Cloud API connection state. |
| `whatsapp_contacts` | WhatsApp contacts known to the tenant. |
| `integrations` | Generic catalog (Google Calendar, Stripe, Zoom, etc.). |

## Migrations

Hand-written SQL files in `drizzle/migrations/`. The journal in
`meta/_journal.json` is the source of truth; `drizzle-kit generate` is
not used here (changes are explicit).

After adding migrations, add the matching entry to `meta/_journal.json`
and compute the sha256 of the SQL file to register it in
`__drizzle_migrations` if the migration was applied out-of-band.

## Commands

```bash
pnpm --filter @workspace/db db:migrate   # apply migrations
pnpm --filter @workspace/db db:push     # push schema directly (dev only)
pnpm --filter @workspace/db db:seed      # seed demo data
pnpm --filter @workspace/db db:reset     # drop + reapply (dev only)
pnpm --filter @workspace/db db:studio    # Drizzle Studio
```

## Seed

`SEED_ORG_ID` env var seeds a specific organization. Without it, the
seed uses the first organization found in the DB. Idempotent: rows that
already exist are skipped.
