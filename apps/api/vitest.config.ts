import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = __dirname
const srcDir = path.resolve(root, "src")
const contractsSrc = path.resolve(root, "../../packages/contracts/src")
const dbSrc = path.resolve(root, "../../packages/db/src")

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: srcDir },
      {
        find: /^@workspace\/contracts$/,
        replacement: path.join(contractsSrc, "index.ts"),
      },
      {
        find: /^@workspace\/contracts\/(.*)$/,
        replacement: path.join(contractsSrc, "$1"),
      },
      {
        find: /^@workspace\/db$/,
        replacement: path.join(dbSrc, "index.ts"),
      },
      {
        find: /^@workspace\/db\/(.+)$/,
        replacement: path.join(dbSrc, "$1"),
      },
    ],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The API auth battery shares a single test DB with the auth suite.
    // Sequential file execution keeps `resetDb` from clobbering rows
    // the other suite is mid-test.
    fileParallelism: false,
  },
})