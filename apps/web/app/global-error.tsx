"use client"

/**
 * Global error boundary for `apps/web`.
 *
 * `global-error.tsx` replaces the entire root document when the root
 * layout itself throws. It MUST include its own `<html>` and `<body>`
 * because the regular layout is bypassed.
 *
 * Keep this minimal and resilient — anything imported here can itself
 * crash the recovery path.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafaf7",
          color: "#111",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 360,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>
            The application could not start. Please try again.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.5 }}>
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: 0,
              background: "#111",
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}