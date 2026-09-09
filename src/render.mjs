import { icon } from "./icons.mjs";
import {
  SESSION_TYPES, TYPE_IDS, WEEKDAYS, RADIUS_CHOICES, DEFAULT_RADIUS_MILES,
  formatShortDay, formatTimeRange, typeLabel
} from "./query.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const attr = escapeHtml;

export function layout({ title, description = "", body, active = "" }) {
  const nav = [
    ["/", "Home", "home"],
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
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text y='19' font-size='19'>&#127954;</text></svg>">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">North Shore <span>Ice Finder</span></a>
    <nav aria-label="Main">${nav}</nav>
  </div>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="wrap">
    <p>A personal project that reads publicly posted rink schedules near Peabody, MA. It is not
    affiliated with any rink, and it never books or holds ice.</p>
    <p class="fine">Rinks cancel walk-on ice for rentals and events. Always check the rink's own
    page — linked on every session — before you drive over.</p>
  </div>
</footer>
<script src="/app.js" type="module"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------------- components */

function typeCard(type, { href, selected = false } = {}) {
  const tag = href ? "a" : "div";
  return `<${tag} class="type-card${selected ? " selected" : ""}"${href ? ` href="${attr(href)}"` : ""}>
    ${icon(type.id)}
    <strong>${escapeHtml(type.label)}</strong>
    <span>${escapeHtml(type.blurb)}</span>
  </${tag}>`;
}

function priceBlock(event) {
  return event.price
    ? `<p class="price">${escapeHtml(event.price)}</p>`
    : `<p class="price none">No price listed</p>`;
}

export function eventCard(event) {
  const distance = typeof event.distanceMiles === "number"
    ? `<span class="distance">(${event.distanceMiles} mi away)</span>` : "";
  return `<article class="event-card">
  <div class="event-main">
    <p class="event-type">${icon(event.type)}<span>${escapeHtml(typeLabel(event.type))}</span></p>
    <p class="event-when">${escapeHtml(formatShortDay(event.start))} &middot; ${escapeHtml(formatTimeRange(event.start, event.end))}</p>
    <p class="event-rink"><a href="/rinks/${attr(event.rinkId)}">${escapeHtml(event.rink)}</a></p>
    <p class="event-where">${icon("pin")}${escapeHtml(event.address ?? event.town ?? "")}</p>
    ${event.title && event.title.toLowerCase() !== typeLabel(event.type).toLowerCase()
      ? `<p class="event-title">Posted as &ldquo;${escapeHtml(event.title)}&rdquo;</p>` : ""}
  </div>
  <div class="event-side">
    ${priceBlock(event)}
    <a class="button ghost" href="${attr(event.sourceUrl)}" target="_blank" rel="noreferrer noopener">Rink site ${icon("external")}</a>
    ${distance}
  </div>
</article>`;
}

export function dayGroups(days) {
  if (days.length === 0) return "";
  return days.map(day => `<section class="day-group">
  <h2 class="day-heading">${escapeHtml(day.label)}</h2>
  ${day.events.map(eventCard).join("\n")}
</section>`).join("\n");
}

function selectField({ name, label, options, value, blank = "Any" }) {
  const items = [`<option value="">${escapeHtml(blank)}</option>`]
    .concat(options.map(option =>
      `<option value="${attr(option.value)}"${String(option.value) === String(value ?? "") ? " selected" : ""}>${escapeHtml(option.label)}</option>`));
  return `<label class="field"><span>${escapeHtml(label)}</span>
    <select name="${attr(name)}">${items.join("")}</select></label>`;
}

export function searchForm({ query, rinks }) {
  const radius = query.radius ?? DEFAULT_RADIUS_MILES;
  const selectedTypes = new Set(query.types ?? TYPE_IDS);

  const typeChips = SESSION_TYPES.map(type => `<label class="chip">
    <input type="checkbox" name="type" value="${attr(type.id)}"${selectedTypes.has(type.id) ? " checked" : ""}>
    ${icon(type.id)}<span>${escapeHtml(type.label)}</span></label>`).join("");

  return `<form class="search" method="get" action="/search">
  <div class="search-bar">
    <label class="sr-only" for="radius">Search radius</label>
    <select id="radius" name="radius">
      ${RADIUS_CHOICES.map(miles => `<option value="${miles}"${Number(radius) === miles ? " selected" : ""}>${miles} miles</option>`).join("")}
    </select>
    <span class="search-pin">${icon("pin")}</span>
    <label class="sr-only" for="zip">ZIP code</label>
    <input id="zip" name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5"
      placeholder="ZIP code" value="${attr(query.zip ?? "")}">
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
    <label class="field"><span>From</span>
      <input type="date" name="start" value="${attr(query.start ?? "")}"></label>
    <label class="field"><span>To</span>
      <input type="date" name="end" value="${attr(query.end ?? "")}"></label>
    <button class="button ghost reset" type="submit" name="reset" value="1">Clear filters</button>
  </div>
</form>`;
}
