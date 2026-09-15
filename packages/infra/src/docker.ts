import { spawn, spawnSync } from "node:child_process"

export type DockerInfo = {
  available: boolean
  version?: string
  composeVersion?: string
}

export function checkDocker(): DockerInfo {
  const versionResult = spawnSync("docker", ["--version"], { encoding: "utf8" })
  if (versionResult.status !== 0) {
    return { available: false }
  }
  const version = (versionResult.stdout ?? "").trim()
  const composeResult = spawnSync("docker", ["compose", "version"], {
    encoding: "utf8",
  })
  const composeVersion =
    composeResult.status === 0
      ? (composeResult.stdout ?? "").trim()
      : undefined
  return { available: true, version, composeVersion }
}

export function runCompose(
  args: string[],
  composeFilePath: string,
  options: { stream?: boolean } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "-f", composeFilePath, ...args], {
      stdio: options.stream ? ["ignore", "pipe", "pipe"] : "pipe",
    })
    let stdout = ""
    let stderr = ""
    if (child.stdout) {
      child.stdout.on("data", (buf) => {
        const text = buf.toString()
        stdout += text
        if (options.stream) process.stdout.write(text)
      })
    }
    if (child.stderr) {
      child.stderr.on("data", (buf) => {
        const text = buf.toString()
        stderr += text
        if (options.stream) process.stderr.write(text)
      })
    }
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

export function formatDockerUnavailable(): string {
  return (
    "Docker is not available on PATH.\n" +
    "Install Docker Desktop (https://www.docker.com/products/docker-desktop/)\n" +
    "and ensure the daemon is running before invoking `pnpm db:up`."
  )
}
