import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbSrc = path.resolve(__dirname, "../db/src")

export default defineConfig({
  resolve: {
    alias: [
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
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Auth flows + middleware suite share a single test DB. Running
    // them in parallel would let the `resetDb` from one suite truncate
    // the rows the other is mid-test. Sequential is fine at this size.
    fileParallelism: false,
  },
})
