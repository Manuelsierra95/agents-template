import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { user, organization, member } from "@workspace/db/schema/index.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))

function readSchemaSource(filename: string): string {
  return readFileSync(resolve(__dirname, `../src/schema/${filename}`), "utf8")
}

describe("schema exports", () => {
  it("exports Better Auth tables", () => {
    expect(user).toBeDefined()
    expect(organization).toBeDefined()
    expect(member).toBeDefined()
  })
})
