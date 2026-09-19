import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = __dirname
const uiSrc = path.resolve(__dirname, "../../packages/ui/src")

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: webRoot + "/" },
      { find: /^@workspace\/ui\/(.*)$/, replacement: `${uiSrc}/$1` },
      { find: /^@workspace\/ui$/, replacement: uiSrc },
    ],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: false,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
})
