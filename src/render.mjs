import { icon } from "./icons.mjs";
import {
  SESSION_TYPES, TYPE_IDS, WEEKDAYS, RADIUS_CHOICES, HOUR_CHOICES, DEFAULT_RADIUS_MILES,
  formatShortDay, formatTimeRange, typeLabel
} from "./query.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const attr = escapeHtml;

// Archivo carries the identity; the fallback stack keeps the weight contrast if the
// font host is unreachable, which is the normal case when this runs on a home network.
const FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;900&display=swap";

export function layout({ title, description = "", body, active = "" }) {
  const nav = [
    ["/search", "Find ice", "search"],
    ["/rinks", "Rinks", "rinks"],
    ["/about", "About", "about"]
  ].map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text y='19' font-size='19'>&#127954;</text></svg>">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">Open<span>Ice</span></a>
    <nav aria-label="Main">${nav}</nav>
  </div>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="wrap">
    <p>OpenIce reads the schedules that rinks already publish, and puts the walk-on sessions in
    one list. It is not affiliated with any rink, and it never books or holds ice.</p>
    <p class="fine">Rinks pull walk-on ice for rentals and events, often the same day. Every
    session here links back to the rink's own page — check it before you drive over.</p>
  </div>
</footer>
<script src="/app.js" type="module"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------------- sessions */

function priceBlock(event) {
  return event.price
    ? `<p class="price">${escapeHtml(event.price)}</p>`
    : `<p class="price none">No price listed</p>`;
}

export function eventCard(event) {
  const distance = typeof event.distanceMiles === "number"
    ? `<p class="distance"><b>${event.distanceMiles}</b>miles</p>` : "";
  const posted = event.title && event.title.toLowerCase() !== typeLabel(event.type).toLowerCase()
    ? `<p class="event-title">Posted as &ldquo;${escapeHtml(event.title)}&rdquo;</p>` : "";
  // Held over from an earlier check because the rink's page could not be reached.
  const stale = event.staleSince
    ? `<p class="stale">Last confirmed ${escapeHtml(formatShortDay(event.staleSince))} — the rink's page is currently unreachable</p>` : "";

  return `<article class="event-card">
  <div class="event-time">
    <p class="event-when">${escapeHtml(formatTimeRange(event.start, event.end))}</p>
    <span class="event-type ${attr(event.type)}">${icon(event.type)}${escapeHtml(typeLabel(event.type))}</span>
  </div>
  <div class="event-main">
    <p class="event-rink"><a href="/rinks/${attr(event.rinkId)}">${escapeHtml(event.rink)}</a></p>
    <p class="event-where">${icon("pin")}${escapeHtml(event.address ?? event.town ?? "")}</p>
    ${posted}
    ${stale}
  </div>
  <div class="event-side">
    ${distance}
    ${priceBlock(event)}
    <a class="button" href="${attr(event.sourceUrl)}" target="_blank" rel="noreferrer noopener">Rink site ${icon("external")}</a>
  </div>
</article>`;
}

export function dayGroups(days) {
  if (days.length === 0) return "";
  return days.map(day => `<section class="day-group">
  <h2 class="day-heading">${escapeHtml(day.label)}</h2>
  <i class="centre-line" aria-hidden="true"></i>
  ${day.events.map(eventCard).join("\n")}
</section>`).join("\n");
}

/* ----------------------------------------------------------------- filters */

function selectField({ name, label, options, value, blank = "Any" }) {
  const items = [`<option value="">${escapeHtml(blank)}</option>`]
    .concat(options.map(option =>
      `<option value="${attr(option.value)}"${String(option.value) === String(value ?? "") ? " selected" : ""}>${escapeHtml(option.label)}</option>`));
  return `<label class="field"><span>${escapeHtml(label)}</span>
    <select name="${attr(name)}">${items.join("")}</select></label>`;
}

export function radiusSelect(value, id) {
  return `<select id="${attr(id)}" name="radius" aria-label="Search radius">${
    RADIUS_CHOICES.map(miles => `<option value="${miles}"${Number(value) === miles ? " selected" : ""}>${miles} miles</option>`).join("")
  }</select>`;
}

export function zipInput(value, id) {
  return `<input id="${attr(id)}" name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5"
    aria-label="ZIP code" placeholder="ZIP code" value="${attr(value ?? "")}">`;
}

export function searchForm({ query, rinks }) {
  const radius = query.radius ?? DEFAULT_RADIUS_MILES;
  const selectedTypes = new Set(query.types ?? TYPE_IDS);

  const typeChips = SESSION_TYPES.map(type => `<label class="chip">
    <input type="checkbox" name="type" value="${attr(type.id)}"${selectedTypes.has(type.id) ? " checked" : ""}>
    ${icon(type.id)}<span>${escapeHtml(type.label)}</span></label>`).join("");

  return `<form class="search" method="get" action="/search">
  <div class="search-bar">
    ${radiusSelect(radius, "radius")}
    ${zipInput(query.zip, "zip")}
    <button class="button" type="submit">${icon("search")}<span>Search</span></button>
  </div>
  <fieldset class="chips">
    <legend class="sr-only">Session types</legend>
    ${typeChips}
  </fieldset>
  <div class="filters">
    ${selectField({ name: "rink", label: "Rink", value: query.rink, blank: "All rinks",
      options: rinks.map(rink => ({ value: rink.id, label: `${rink.name} — ${rink.town}` })) })}
    ${selectField({ name: "weekday", label: "Weekday", value: query.weekday, blank: "Any day",
      options: WEEKDAYS.map(day => ({ value: day.id, label: day.label })) })}
    ${selectField({ name: "after", label: "Earliest start", value: query.after, blank: "Any time",
      options: HOUR_CHOICES.map(hour => ({ value: hour.value, label: hour.label })) })}
    ${selectField({ name: "before", label: "Latest start", value: query.before, blank: "Any time",
      options: HOUR_CHOICES.map(hour => ({ value: hour.value, label: hour.label })) })}
    <label class="field"><span>First day</span>
      <input type="date" name="start" value="${attr(query.start ?? "")}"></label>
    <label class="field"><span>Last day</span>
      <input type="date" name="end" value="${attr(query.end ?? "")}"></label>
    <button class="reset" type="submit" name="reset" value="1">Clear filters</button>
  </div>
</form>`;
}
