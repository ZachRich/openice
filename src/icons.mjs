// Simple original line icons, drawn here rather than pulled from a CDN so the site
// stays dependency-free and self-contained.
const wrap = (label, body) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label}">${body}</svg>`;

export const ICONS = {
  "stick-puck": wrap("Stick and puck", '<path d="M5 3 14 15c.5.7 1.2 1 2 1h3"/><ellipse cx="7.5" cy="19.5" rx="3.5" ry="1.6"/>'),
  pickup: wrap("Pickup hockey", '<path d="M4 3 15 16"/><path d="M20 3 9 16"/><ellipse cx="12" cy="20" rx="3.5" ry="1.6"/>'),
  "public-skate": wrap("Public skate", '<path d="M7 3v7l6 3v3H7z"/><path d="M4 18h15"/><path d="M8 16v2"/><path d="M16 16v2"/>'),
  pin: wrap("Location", '<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  search: wrap("Search", '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  clock: wrap("Time", '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>'),
  refresh: wrap("Refresh", '<path d="M20 11a8 8 0 1 0-.7 4.5"/><path d="M20 5v6h-6"/>'),
  external: wrap("Opens the rink site", '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>')
};

export function icon(name) { return ICONS[name] ?? ""; }
