import { Hono } from "hono"
import type { Auth } from "@workspace/auth"

export function makeAuthRoute(auth: Auth): Hono {
  const route = new Hono()
  // Better Auth's HTTP handler owns the entire `/auth/*` surface — every
  // method and every path under it. Using `route.on([...], "/*", ...)` looks
  // equivalent but the sub-app's path matching is anchored relative to the
  // mount point (`/auth`) and `/*` does not always register as a true
  // catch-all in that context, so requests like `GET /api/auth/get-session`
  // fall through to Hono's `notFound` and return 404.
  //
  // `route.all("*", ...)` matches every method on every path, then we hand
  // the raw `Request` to Better Auth's handler — it parses the URL and
  // routes internally, and falls back to 404 itself for unknown endpoints.
  route.all("*", (c) => auth.handler(c.req.raw))
  return route
}
