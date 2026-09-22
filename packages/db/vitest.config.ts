import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Populate `process.env.DATABASE_URL_TEST` from `apps/api/.env` so
    // the integration suite can connect to the docker-compose test DB
    // without a root `.env` file.
    setupFiles: ["./tests/setup.ts"],
  },
})
