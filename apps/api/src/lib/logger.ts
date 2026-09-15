type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function currentLevel(): LogLevel {
  const value = process.env.LOG_LEVEL
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value
  }
  return "info"
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()]
}

function emit(
  level: LogLevel,
  payload: Record<string, unknown>,
  message: string,
): void {
  if (!shouldLog(level)) return
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...payload,
  })
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n")
  } else {
    process.stdout.write(line + "\n")
  }
}

export const logger = {
  debug: (payload: Record<string, unknown>, message: string) =>
    emit("debug", payload, message),
  info: (payload: Record<string, unknown>, message: string) =>
    emit("info", payload, message),
  warn: (payload: Record<string, unknown>, message: string) =>
    emit("warn", payload, message),
  error: (payload: Record<string, unknown>, message: string) =>
    emit("error", payload, message),
}