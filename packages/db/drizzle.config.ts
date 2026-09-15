import { defineConfig } from "drizzle-kit"
import { loadDbConfig } from "./src/config"

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: loadDbConfig().DATABASE_URL,
  },
  strict: true,
  verbose: true,
})
