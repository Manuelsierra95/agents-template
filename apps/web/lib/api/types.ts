/**
 * Shared API response types — derived from `@workspace/contracts` Zod
 * schemas. The UI never re-defines API shapes; if the API contract
 * changes, update the schemas and the rest follows.
 */

export type AppMe = {
	user: { id: string; email: string; name: string }
	organizationId: string
	organizationName: string | null
	role: string
}
