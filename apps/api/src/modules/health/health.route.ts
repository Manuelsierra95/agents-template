import { Hono } from "hono"
import { getHealth } from "@/modules/health/health.service"

export const healthRoute = new Hono()

healthRoute.get("/health", (c) => {
  return c.json(getHealth())
})