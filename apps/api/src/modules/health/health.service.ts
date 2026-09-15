export interface HealthStatus {
  status: "ok"
  uptimeSeconds: number
  timestamp: string
}

const startedAt = Date.now()

export function getHealth(): HealthStatus {
  return {
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  }
}