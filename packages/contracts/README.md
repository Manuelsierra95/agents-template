# `@workspace/contracts`

Shared types and Zod schemas for the monorepo.

## Responsibility

Contains **only**:

- Zod schemas (source of truth for shapes).
- TypeScript types derived from schemas via `z.infer`.
- DTOs (re-exports).

It **must not contain**:

- Business logic.
- Database access.
- HTTP handlers.
- Framework-specific code.

## Layout

```text
src/
├── agents/
│   ├── schemas.ts          # Zod schemas (source of truth)
│   ├── types.ts            # z.infer<> types
│   └── index.ts            # re-exports
├── notifications/
│   ├── schemas.ts
│   ├── types.ts
│   └── index.ts
├── chat/
│   ├── schemas.ts
│   ├── types.ts
│   └── index.ts
├── agent-ui/
│   ├── schemas.ts          # 10 discriminated block schemas + union
│   ├── types.ts
│   ├── schemas.test.ts
│   └── index.ts            # AGENT_UI_BLOCK_TYPES + AGENT_UI_TOOLS registry
└── index.ts                # namespaced re-exports (Agents, Notifications, Chat, AgentUI)
```

## Usage

### From apps

```ts
import { AgentSchema, type Agent } from "@workspace/contracts/agents"

// Validate an inbound payload
const agent = AgentSchema.parse(payload)

// Type a return value
function listAgents(): Promise<Agent[]> { ... }
```

Or via the namespaced export:

```ts
import { Agents, AgentUI } from "@workspace/contracts"
const agent = Agents.AgentSchema.parse(payload)
const block = AgentUI.AgentUIBlockSchema.parse(toolOutput)
```

### `agent-ui` — Agent UI Toolkit contracts

Single source of truth for the structured UI blocks the Eve agent can emit.
The agent never produces JSX or arbitrary component names — it calls a tool
that returns a discriminated union member of `AgentUIBlockSchema`, and the
web client mounts the matching primitive from `packages/ui`.

- `AgentUIBlockSchema` — `z.discriminatedUnion("type", [...])` of 10 blocks.
- `AGENT_UI_TOOLS` — frozen list of `{ toolName, blockType, description }`
  rows that document which tools the model may call.
- `AGENT_UI_BLOCK_TYPES` — frozen list of every `type` literal.

The renderer in `apps/web` is a single switch on `block.type`. Adding a new
block means: add a schema here, register it in `AGENT_UI_TOOLS`, implement
the matching primitive, and add one `case` to `AgentUIRenderer`.

### Why Zod-first?

Schemas double as runtime validators and static types. The shape lives in
one place; consumer code stays in sync automatically.

## Adding a new domain

1. Create `src/<domain>/schemas.ts` with the Zod schemas.
2. Create `src/<domain>/types.ts` with `z.infer` aliases.
3. Create `src/<domain>/index.ts` that re-exports both.
4. Add the namespace to `src/index.ts`.

No business logic, no handlers — just contracts.