/** Google Meet icon as an inline data-URL SVG. The template pulls this from a
 * dedicated `thesvg/google-meet-2026` package; for the mock project we inline a
 * stylised rendition that reads as the Meet brand mark. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#00ac47"/><stop offset=".5" stop-color="#0084f8"/><stop offset="1" stop-color="#ea4335"/></linearGradient></defs><rect width="40" height="40" rx="8" fill="url(#g)"/><path fill="#fff" d="M11 14h11a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H11z"/><path fill="#fff" d="m26 22 6-4v8z"/></svg>`;

const googleMeetIconSrc = `data:image/svg+xml,${encodeURIComponent(svg)}`;

export function GoogleMeetIcon({ className }: { className?: string }) {
  return (
    <img
      src={googleMeetIconSrc}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
    />
  );
}
