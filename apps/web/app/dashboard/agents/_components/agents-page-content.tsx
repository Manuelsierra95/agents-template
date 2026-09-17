/**
 * `/dashboard/agents` placeholder content (Server Component leaf).
 *
 * Renders the "Próximamente" card until the real `Agents` feature
 * (CRUD of agent personas, tools, knowledge base) is reintroduced.
 * Replace this file's body with `<AgentsList />` (or whatever feature
 * primitive lives in `apps/web/features/agents/`) when the feature
 * lands — `page.tsx` and the Suspense boundary below stay untouched.
 */
export function AgentsPageContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] tracking-wide text-ink-3 uppercase">
          Agents
        </p>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Próximamente
        </h1>
        <p className="text-[13px] text-ink-2">
          La gestión de agentes se reintroducirá en una fase posterior.
        </p>
      </header>
    </div>
  )
}
