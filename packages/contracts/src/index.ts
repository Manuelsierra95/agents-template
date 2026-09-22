/**
 * @workspace/contracts — wire schemas shared by `apps/api` (server) and
 * `apps/web` (client). Every cross-package type lives here; consumers
 * never import from one app into another.
 */
export * from "@workspace/contracts/calendar/schemas.ts"
export * from "@workspace/contracts/realtime/index.ts"
