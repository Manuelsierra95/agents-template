# Agents-Template

Eve is a multi-tenant business assistant that takes inbound customer messages (WhatsApp, web chat, etc.) and produces a natural-language reply — booking an appointment, answering a question, escalating to a human, etc.

The conversation is shaped by **two cooperating language models**, each with a sharply different job:

- **Jev** — a TypeSafe AI decision model that answers one _typed decision_ per turn: given the conversation state, which of the six Eve actions should we take? (`chat`, `check_availability`, `create_booking`, `cancel_booking`, `reschedule_booking`, `human`.)
- **MiniMax M3** — the conversational language model that writes the reply in natural Spanish and calls the single calendar tool Jev's decision exposed for the turn.

Eve orchestrates them: TypeScript obtains Jev's decision, exposes the matching calendar tool (or none), feeds the conversation to MiniMax, and ships the natural-language reply back to the customer.

## Architecture

```text
customer

   │
   ▼
┌──────────────────────────┐
│ apps/web  (Next.js)     │   operator + chat UI
└────────────┬─────────────┘
             │ POST /api/chat/messages (NDJSON stream)
             ▼
┌──────────────────────────┐
│ apps/api  (Hono)         │   conversation persistence,
│                          │   calendar endpoints, session auth
└────────────┬─────────────┘
             │ (organizes /eve/v1/session/:id/messages through internal proxy)
             ▼
┌──────────────────────────────────────────────────────────────────┐
│ apps/agent  (TypeScript — Eve runtime)                           │
│                                                                   │
│   JevDecisionProvider ──► TypeSafe AI / Jev                      │
│        │                                                          │
│        │  one typed EveAction per turn                            │
│        ▼                                                          │
│   shared state slot                                               │
│        │                                                          │
│        ├──► action-router                                         │
│        │      └─ exposes exactly ONE calendar tool (or null)      │
│        │         based on the JevDecision, e.g. create_booking    │
│        │                                                          │
│        └──► action-context                                        │
│               └─ injects a per-action system message into MiniMax │
│                                                                   │
│   MiniMax M3  (the conversational language model)                 │
│      └─ writes natural Spanish, calls the ONE calendar tool,       │
│         reads its result, produces the final user reply           │
└──────────────────────────────────────────────────────────────────┘
             │ (tool calls only)
             ▼
┌──────────────────────────┐
│ apps/api (/api/internal/*)│   calendar endpoints, persists reply
└────────────┬─────────────┘
             │
             ▼
      PostgreSQL (Drizzle)
```

### Flow per turn

```text
customer → apps/web → apps/api → apps/agent

                              │
                              ├── JevDecisionProvider
                              │     │
                              │     ▼
                              │   Jev / TypeSafe AI
                              │     │
                              │     ▼
                              │   ONE EveAction
                              │
                              │   (writes to shared state)
                              │
                              ├── action-router ── ONE calendar tool
                              │
                              ├── action-context ── system hint for MiniMax
                              │
                              ├── MiniMax M3 reads
                              │     (user msg + action + tool)
                              │
                              │     └── tool call ── apps/api
                              │           └── /api/internal/*
                              │                 └── PostgreSQL
                              │
                              └── final reply streamed back to browser
```

The important architectural properties are:

1. **Jev runs once per turn inside Eve.** The customer's message goes through `apps/web` → `apps/api` → `apps/agent`. Eve builds the decision state and asks Jev for exactly one typed `EveAction`.

2. **Jev decides the action, not the answer.** The decision produces an `EveAction` that drives `action-router`. Eve exposes exactly one calendar tool (or none for `chat` / `human`). MiniMax cannot select a different action through tool choice because the available tool set is constructed from Jev's decision.

3. **The decision is typed and provider-independent.** Eve uses a `DecisionProvider` abstraction. The current implementation is `JevDecisionProvider`, backed by the TypeSafe AI Jev integration. The rest of the runtime does not depend directly on Jev's API.

4. **The tool reaches the database via `apps/api`.** MiniMax's tool call is a plain HTTP request to `apps/api/internal/*` using the `INTERNAL_API_TOKEN`. `apps/api` is the only path to PostgreSQL; Eve never accesses the database directly.

5. **MiniMax is the conversational model.** MiniMax M3 receives the user conversation together with the action context and the tool available for that turn. It writes the natural-language response and uses the exposed calendar tool when required.

6. **The final reply is streamed through `apps/api`.** `apps/api` proxies Eve's NDJSON stream to the browser as it arrives. The final assistant message is persisted server-side before the stream closes.

## Repository layout

```text
apps/

├── agent/          Eve runtime. TypeScript.
│                   Uses Jev for typed action decisions and MiniMax M3
│                   for conversational responses.
│                   Talks to apps/api for data and owns the dynamic
│                   calendar tool set and action context.
│
├── api/            Hono backend. The ONLY path to PostgreSQL.
│                   Handles auth, conversations, calendar CRUD, and the
│                   /api/chat/messages streaming bridge to apps/agent.
│
├── web/            Next.js operator + chat UI.
│                   Calls /api/* over the reverse proxy and renders
│                   the MessageScroller from the NDJSON stream.
│
packages/

├── auth/              Better Auth glue.
├── contracts/         Shared Zod schemas.
├── db/                Drizzle ORM + schema + migration tool.
├── eslint-config/     Workspace ESLint presets.
├── infra/             docker-compose for local Postgres/Redis.
├── typescript-config/ Workspace tsconfig presets.
└── ui/                Shared shadcn/ui components (button, scroll-area, …).
```

## Running it locally

You need two application terminals.

### Terminal 1 — apps/api

```bash
pnpm --filter api dev
# → http://127.0.0.1:4000 (Hono)
```

`apps/api` reads its configuration from `apps/api/.env` (gitignored).

The `INTERNAL_API_TOKEN` used by `apps/agent` must match the value configured in `apps/api/.env`.

### Terminal 2 — apps/agent (Eve runtime)

```bash
pnpm --filter agent dev
# → http://127.0.0.1:2000 (Eve HTTP surface)
```

`apps/agent` reads its configuration from `apps/agent/.env` (gitignored).

The Jev integration uses the TypeSafe AI provider and requires:

```text
TYPESAFE_AI_API_KEY
```

MiniMax M3 requires the corresponding MiniMax configuration used by the agent runtime.

## Tests

- `pnpm --filter agent test` — runs the Eve agent test suite. The `DecisionProvider` can be stubbed through `setDecisionProvider`, while calendar tools mock `apps/api` through `globalThis.fetch`.
- `pnpm --filter api test` — tests the Hono routes.
- `pnpm test` — runs the entire workspace serially.

The agent tests cover the decision layer, action routing, action context and calendar-tool integration without requiring a live Jev request.

## Deeper documentation

- `AGENTS.md` — workspace-level architecture and agent development rules.
- `apps/agent/README.md` — the action router, action context, decision provider and agent runtime.
- `apps/api/README.md` — calendar endpoints and the `/api/chat/messages` stream.
- `packages/db/README.md` — schema, migrations and DB-requiring tests.
