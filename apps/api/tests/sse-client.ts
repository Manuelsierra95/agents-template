/**
 * Tiny SSE client used by tests/events.test.ts and any future
 * realtime test. Reads a chunked text/event-stream response and
 * yields each complete SSE event as it arrives.
 *
 * Implementation notes:
 *   - Server-Sent Events are encoded as `event: <name>\ndata: <json>\n\n`
 *     (plus optional `id:` and `retry:` lines).
 *   - We split the streamed buffer on the blank-line separator and
 *     feed each "event + data" pair into `ingest`.
 *   - The caller is responsible for calling `close()` (which aborts
 *     the underlying response) when the test is done — leaving it
 *     hanging would keep the test suite waiting on the hub.
 */

export type IngestEventFn = (event: {
	type: string
	data: string
}) => void

export type SSEEvent = { type: string; data: string }

export type SSEClientHandle = {
	ingest(handler: IngestEventFn): void
	response: Response
	close: () => Promise<void>
}

export function makeSseClient(response: Response): SSEClientHandle {
	const handlers: IngestEventFn[] = []
	let buffer = ""
	const decoder = new TextDecoder()
	const controller = new AbortController()

	void (async () => {
		const body = response.body
		if (!body) return
		const reader = body.getReader()
		try {
			while (!controller.signal.aborted) {
				const { value, done } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				let splitAt = buffer.indexOf("\n\n")
				while (splitAt !== -1) {
					const raw = buffer.slice(0, splitAt)
					buffer = buffer.slice(splitAt + 2)
					const parsed = parseSseFrame(raw)
					if (parsed) {
						for (const h of handlers) h(parsed)
					}
					splitAt = buffer.indexOf("\n\n")
				}
			}
		} catch {
			// aborted — fine.
		}
	})()

	return {
		ingest(handler) {
			handlers.push(handler)
		},
		response,
		async close() {
			controller.abort()
			try {
				await response.body?.cancel()
			} catch {
				// Already closed.
			}
		},
	}
}

function parseSseFrame(raw: string): SSEEvent | null {
	let type = "message"
	let data = ""
	for (const line of raw.split("\n")) {
		if (!line) continue
		if (line.startsWith(":")) continue // comment / keep-alive
		const colon = line.indexOf(":")
		if (colon < 0) continue
		const field = line.slice(0, colon).trim()
		const value = line.slice(colon + 1).trim()
		if (field === "event") type = value
		else if (field === "data") data += value === "" ? "" : value
	}
	if (type === "ping" || data === "") {
		return { type, data }
	}
	return data ? { type, data } : null
}
