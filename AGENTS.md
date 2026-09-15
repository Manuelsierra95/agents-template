<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tests

`pnpm test` is the canonical entrypoint. It runs every workspace's `test` script in series (via `pnpm -r --workspace-concurrency=1 --if-present run test`). Anything that should be verified on every push lives under a workspace's `test` script.

## First-time setup (one per machine)

```bash
docker compose -f packages/infra/docker/compose.yml up -d postgres
pnpm db:test:setup    # creates agents_test + applies Drizzle migrations
```

`pnpm db:test:setup` is idempotent — re-run it freely.

## Conventions

- Tests that need Postgres use `DATABASE_URL_TEST`. The root script defaults it to `postgresql://agents:agents@127.0.0.1:5432/agents_test` (the docker-compose dev DB), so `pnpm test` Just Works. Override the env var if you point at a different host.
- Suites that touch the DB truncate every relevant table in `beforeEach` (see `packages/auth/tests/helpers.ts:resetDb` and the inlined copy in `apps/api/tests/auth-battery.test.ts`). Two suites that share the same DB therefore cannot run in parallel — `--workspace-concurrency=1` enforces the ordering.
- New test files in `tests/` (or co-located `*.test.ts`) are auto-picked-up by the workspace's existing `vitest run` task. No wiring needed.

## Aliases

| Command | Scope |
|---|---|
| `pnpm test` | every workspace, serial |
| `pnpm test:auth` | `@workspace/auth` only |
| `pnpm test:api` | `apps/api` only |
| `pnpm test:db` | `@workspace/db` only |
| `pnpm test:web` | `apps/web` only |

## Pre-push rule

A `pre-push` git hook (`simple-git-hooks`) runs `pnpm test` before every `git push`. The hook is installed automatically by `pnpm install` via the `prepare` script. Bypass it for a single push with `SKIP_SIMPLE_GIT_HOOKS=1 git push …` — don't make a habit of it.

If a test fails, the push is blocked. Fix the test (or the bug it caught) and try again.
