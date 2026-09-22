# `@workspace/infra`

Local infrastructure for the monorepo: today, just a PostgreSQL container
orchestrated via Docker Compose. The package also exposes small TypeScript
helpers that the rest of the monorepo can use to interact with Docker and
to check Postgres readiness.

## Layout

```text
packages/infra/
├── docker/
│   └── compose.yml          # Postgres 18 service
├── src/
│   ├── commands/
│   │   ├── up.ts            # `pnpm db:up`
│   │   ├── down.ts          # `pnpm db:down`
│   │   ├── status.ts        # `pnpm db:status`
│   │   └── logs.ts          # `pnpm db:logs`
│   ├── compose.ts           # composeFilePath
│   ├── docker.ts            # checkDocker, runCompose
│   ├── postgres.ts          # checkPostgresReady
│   └── index.ts
├── tests/
├── package.json
└── README.md
```

## What it provides

A single `postgres:18` container with:

- Configurable user, password, database, port (env-driven).
- A persistent named volume (`agents-template-postgres-data`) that survives
  `docker compose down`.
- A healthcheck using `pg_isready`.

No `Dockerfile` is shipped. The official image is used directly.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_USER` | `agents` | DB user inside the container. |
| `POSTGRES_PASSWORD` | `agents` | DB password. |
| `POSTGRES_DB` | `agents` | Initial database name. |
| `POSTGRES_PORT` | `5432` | Host port mapped to container's `5432`. |
| `DATABASE_URL` | — | Connection string. Required for `db:up` to verify readiness. Read from `apps/api/.env`. |

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`
and `REDIS_PORT` live in `packages/infra/docker/.env` (gitignored,
colocated with `compose.yml`). `DATABASE_URL` lives in `apps/api/.env`
— that file is the runtime's source of truth.

## Commands

### `pnpm db:up`

1. Verifies Docker is on `PATH`.
2. Reads `DATABASE_URL`.
3. Tries `select 1` against `DATABASE_URL`:
   - success → logs "PostgreSQL already running" and exits.
   - failure → runs `docker compose -f packages/infra/docker/compose.yml up -d`,
     then polls `checkPostgresReady()` until success or 60s timeout.
4. On timeout, prints the last 50 lines of `docker compose logs postgres`.

### `pnpm db:down`

Runs `docker compose -f packages/infra/docker/compose.yml down`. The named
volume is preserved.

### `pnpm db:status`

Runs `docker compose -f packages/infra/docker/compose.yml ps` and calls
`checkPostgresReady()` to report whether the database is reachable.

### `pnpm db:logs`

Streams the last 200 lines of `docker compose logs -f postgres`. Pass
`--tail=<N>` to override the line count.

## `db:down` vs `db:reset`

```text
db:down    Stop the container. The named volume keeps the data.
db:reset   (in @workspace/db) Drops the public schema, re-applies migrations,
           and runs seeds. Use during development when you want a clean slate.
           Refuses to run when NODE_ENV=production.
```

To nuke the volume entirely (destructive):

```bash
docker compose -f packages/infra/docker/compose.yml down -v
```

## `checkPostgresReady()`

`@workspace/infra` exports a connection-URL-based check used by `scripts/dev.mjs`:

```ts
import { checkPostgresReady } from "@workspace/infra/postgres"
const r = await checkPostgresReady(process.env.DATABASE_URL!)
if (r.ready) { /* proceed */ } else { /* start docker compose up */ }
```

It opens a short-lived `postgres-js` connection with `connect_timeout: 2` and
runs `select 1`. It never throws; failures return `{ ready: false, reason }`.

## VPS considerations

This package is for **local development**. On a VPS:

- Run PostgreSQL via your platform's managed service (or a dedicated
  container) and point `DATABASE_URL` at it.
- Do **not** rely on `db:up`/`db:down` in production.
- Do **not** run `db:reset` in production — it is dev-only by design.
- Migrations are applied explicitly via `pnpm db:migrate` (or your CI/CD
  pipeline), never via `db:push`.

The architecture allows PostgreSQL to live in a separate container or on a
managed service because no code in the monorepo hardcodes `localhost` —
every consumer reads `DATABASE_URL`.
