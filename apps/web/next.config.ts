import type { NextConfig } from "next"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"

const nextConfig: NextConfig = {
  // Enable Next.js 16 Cache Components (PPR + `use cache` + `cacheLife`/`cacheTag`).
  // This is the foundation for our default SSR + Suspense + skeletons
  // architecture. Cache Components automatically enables Instant Navigation
  // (React `<Activity>`-preserved state across navigations) — no extra
  // experimental flag required.
  cacheComponents: true,
  partialPrefetching: true,

  transpilePackages: ["@workspace/ui"],

  async redirects() {
    return [
      { source: "/agents", destination: "/dashboard/agents", permanent: false },
      {
        source: "/agents/:id",
        destination: "/dashboard/agents/:id",
        permanent: false,
      },
    ]
  },

  // Proxy every /api/* and /eve/* request through the web origin so that
  // browser-set cookies (SameSite=Lax) are sent on the very next fetch.
  // Without these rewrites the web (`localhost:3000`) and the API
  // (`localhost:4000`) are different origins, so Lax cookies are dropped
  // on cross-origin subresource requests (fetch/XHR) and authenticated
  // endpoints return 401 even after a successful sign-in.
  //
  // In production the same routing is done by the reverse proxy (Caddy /
  // Nginx) at the edge — `apps/web` and `apps/api` are not directly
  // reachable from the internet, so the rewrite here is purely a
  // dev-time convenience that keeps dev and prod behaviour identical
  // (one origin, one cookie jar).
  //
  // The two specific rewrites below must stay listed BEFORE the generic
  // `/api/:path*` catch-all; Next evaluates rewrites in order and the
  // most specific match wins, but listing them first also makes the
  // intent obvious to a human reader.
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${API_URL}/api/auth/:path*` },
      { source: "/eve/:path*", destination: `${API_URL}/eve/:path*` },
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
    ]
  },
}

export default nextConfig
