---
name: testing
description: Project testing standard. Use when adding or modifying any feature — endpoints, services, schemas, agents, tools, subagents, schedules, integrations, or bug fixes — to decide what tests to write and how. The Definition of Done below applies to every change.
---

# Testing

> **A feature is not done until its tests exist and all relevant tests pass.**

This rule applies to, at minimum:

- New API modules.
- New endpoints.
- Changes to existing endpoints.
- New services.
- New schemas or validations.
- New Eve agents.
- Changes to existing Eve agents.
- New Eve tools.
- New Eve skills with executable behaviour.
- New subagents.
- New schedules.
- New integrations.
- Changes to business logic.
- Bug fixes.
- Any change that can alter existing behaviour.

## Test-first mindset

Before a feature is considered done, identify:

1. What behaviour is being added.
2. What happy-path cases must work.
3. What edge cases must be covered.
4. What errors must be produced.
5. What existing behaviour could regress.

Strict TDD is not required, but the change **must end with adequate tests in place**.

## Definition of Done

A feature is not complete until:

```text
implementation
   ↓
tests created/updated
   ↓
tests pass
   ↓
typecheck passes
   ↓
lint passes
   ↓
build passes
   ↓
implementation complete
```

Before declaring a task done, run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

(Use whatever scripts the monorepo exposes if the names differ.)

**Never:**

- Hide errors to make a run pass.
- Disable tests to make a run pass.
- Modify tests to pass without fixing the real behaviour they verify.

## API tests

For every new module/endpoint, cover at minimum:

- Happy path.
- Input validation.
- Error cases.
- HTTP status codes.
- Response shape.
- Relevant service behaviour.

Example — a new endpoint `POST /something` should have tests for:

- Valid request.
- Invalid request.
- Missing required fields.
- Expected business error.
- Unexpected error path.
- Correct response body.
- Correct status code.

Skip a category only when it genuinely does not apply to the endpoint.

Use `app.request()` (Hono) so no real server is required.

## Eve tests

For Eve components, test observable behaviour, not internals.

### Tools

For a new tool, test:

```text
tool input  →  tool execution  →  expected result
```

- Valid inputs.
- Invalid inputs (when applicable).
- Expected results.
- Errors.

Do **not** attempt to assert internal LLM reasoning. Mock the LLM when a
test would otherwise depend on it.

### Agents and subagents

For a new agent or subagent, assert at least:

- The agent definition is present and well-formed.
- The model identifier is set.
- Instructions or skills referenced exist.

Avoid tests that assert LLM prose. Prefer deterministic tests of:

- Tools.
- Schemas.
- Routing.
- Orchestration.
- State.
- Transformations.
- Contracts.
- Observable results.

Mock models, external APIs, and any non-deterministic service.

## Regression tests

When fixing a bug:

1. Write a failing test that reproduces the problem.
2. Fix the bug.
3. Confirm the new test passes.
4. Confirm the full suite still passes.

The fix must be protected by a regression test.

## Test placement

- App-specific tests live **next to the code they exercise** (`tests/`
  folder or co-located `*.test.ts`).
- Cross-app helpers (factories, request helpers, fixtures) belong in a
  shared `packages/*` package **only when two or more apps genuinely
  need them**.
- Do **not** create a shared test package "just in case". Tests stay
  with the code; shared utilities emerge from real duplication.

## Coverage

Do not chase a coverage percentage. Prefer **behaviour coverage** over
line coverage. A small set of well-targeted tests is better than a large
set of shallow ones. The amount of testing should be proportional to the
complexity and risk of the feature.