import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const composeFilePath = path.resolve(__dirname, "..", "docker", "compose.yml")

export const projectRoot = path.resolve(__dirname, "..", "..", "..")
