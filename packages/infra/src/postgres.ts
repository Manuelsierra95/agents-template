import postgres from "postgres"

export type PostgresReadyResult =
  | { ready: true; url: string }
  | { ready: false; reason: string; url: string }

export async function checkPostgresReady(
  connectionString: string,
  options: { timeoutMs?: number } = {},
): Promise<PostgresReadyResult> {
  const timeoutMs = options.timeoutMs ?? 5000
  let sql: ReturnType<typeof postgres> | null = null
  try {
    sql = postgres(connectionString, {
      max: 1,
      connect_timeout: 2,
      idle_timeout: 1,
      prepare: false,
      onnotice: () => undefined,
    })
    const result = await Promise.race([
      sql`select 1 as ok`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ])
    if (Array.isArray(result) && result.length > 0) {
      return { ready: true, url: connectionString }
    }
    return { ready: false, reason: "no result", url: connectionString }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ready: false, reason, url: connectionString }
  } finally {
    if (sql) {
      try {
        await sql.end({ timeout: 1 })
      } catch {
        // best-effort
      }
    }
  }
}
