/**
 * `brandMesh(intensity)` — temporary stub for the project's signature
 * gradient mesh. The original implementation lived in a separate
 * package that was not migrated in this phase.
 *
 * Behaviour: returns a data-URL SVG with a single radial gradient whose
 * opacity scales with `intensity` (0..1). Used by `BrandPanel` (login +
 * sign-up) and the sidebar's footer callouts, both of which need a
 * stable image source so the layout doesn't break.
 *
 * Replace this with the proper mesh renderer once the design-system
 * package lands.
 */
export function brandMesh(intensity: number = 0.6): string {
  const clamped = Math.max(0, Math.min(1, intensity))
  // Two radial gradients on top of a flat fill give a soft mesh look
  // without pulling in additional dependencies.
  const fill = Math.round(clamped * 28)
  const accent = Math.round(clamped * 36)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" preserveAspectRatio="none">
      <defs>
        <radialGradient id="g1" cx="20%" cy="20%" r="60%">
          <stop offset="0%" stop-color="hsl(220, 80%, ${70 + fill}%)" stop-opacity="${0.35 + clamped * 0.4}" />
          <stop offset="100%" stop-color="hsl(220, 80%, ${70 + fill}%)" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="g2" cx="80%" cy="80%" r="70%">
          <stop offset="0%" stop-color="hsl(280, 70%, ${60 + accent}%)" stop-opacity="${0.25 + clamped * 0.35}" />
          <stop offset="100%" stop-color="hsl(280, 70%, ${60 + accent}%)" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="hsl(${220 + accent * 2}, 24%, 16%)" />
      <rect width="100%" height="100%" fill="url(#g1)" />
      <rect width="100%" height="100%" fill="url(#g2)" />
    </svg>
  `.trim()
  // Use Buffer (Node) / base64 via btoa in the browser. Fall back to a
  // pre-encoded minimal placeholder when neither is available.
  const base64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, "utf8").toString("base64")
  return `data:image/svg+xml;base64,${base64}`
}
