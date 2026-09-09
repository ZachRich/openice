import { layout, escapeHtml, searchForm, dayGroups, radiusSelect, zipInput } from "./render.mjs";
import { icon } from "./icons.mjs";
import { SESSION_TYPES, DEFAULT_RADIUS_MILES } from "./query.mjs";

const attr = escapeHtml;

const STATE_LABEL = {
  ok: "Checking normally",
  error: "Last check failed",
  disabled: "Not indexed yet",
  "needs-adapter": "Waiting on a supported feed"
};

function stateBadge(status) {
  const state = status?.state ?? "unknown";
  return `<span class="state ${attr(state)}"><i></i>${escapeHtml(STATE_LABEL[state] ?? "Unknown")}</span>`;
}

function lastChecked(updatedAt) {
  if (!updatedAt) return "not checked yet";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  }).format(new Date(updatedAt));
}

/* -------------------------------------------------------------------- home */

export function homePage({ sources, events, updatedAt, homeZip = "01960" }) {
  const live = sources.filter(source => source.enabled);
  const counts = Object.fromEntries(SESSION_TYPES.map(type =>
    [type.id, events.filter(event => event.type === type.id).length]));

  const typeCards = SESSION_TYPES.map(type => `<a class="type-card" href="/search?type=${attr(type.id)}">
    ${icon(type.id)}
    <strong>${escapeHtml(type.label)}</strong>
    <span>${counts[type.id]} upcoming</span>
  </a>`).join("");

  const faq = [
    ["Where does the schedule come from?",
     "Public rink calendars and published schedule pages only — the same pages you would read yourself. Nothing here comes from a booking system or an account login."],
    ["How often does it update?",
     "Every six hours, and immediately whenever the app starts. Each source shows when it was last checked successfully."],
    ["Why is a rink I know missing?",
     "Because it does not publish a schedule this app can read reliably. A rink is only added once it has a public page or calendar feed with real future sessions on it — guessing is worse than leaving it out."],
    ["Can I book ice through this?",
     "No. It finds sessions and links you to the rink. Registration, payment, and cancellation all happen on the rink's own page."],
    ["Is the distance driving time?",
     "No — it is straight-line distance from the centre of your ZIP code. Traffic on 128 is your problem."]
  ].map(([question, answer]) => `<details class="faq-item">
    <summary>${question}</summary><p>${answer}</p></details>`).join("");

  const body = `<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Massachusetts</p>
    <h1>Find more ice.</h1>
    <p class="lede">Every stick &amp; puck, pickup skate, and public session posted by rinks near
      you — collected from the rinks' own schedules, in one list.</p>
    <div class="type-cards">${typeCards}</div>
    <form class="search-bar hero-search" method="get" action="/search">
      ${radiusSelect(DEFAULT_RADIUS_MILES, "hero-radius")}
      ${zipInput(homeZip, "hero-zip")}
      <button class="button" type="submit">${icon("search")}<span>Search</span></button>
    </form>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>What's covered</h2>
    <p class="section-lede">${live.length} rinks checked continuously, ${events.length} sessions on the
      board right now. Last checked ${escapeHtml(lastChecked(updatedAt))}.</p>
    <div class="rink-grid">
      ${sources.filter(source => source.enabled).map(source => `<a class="rink-tile" href="/rinks/${attr(source.id)}">
        <strong>${escapeHtml(source.name)}</strong>
        <span>${escapeHtml(source.town)}</span>
      </a>`).join("")}
    </div>
    <p><a class="button ghost" href="/rinks">See every rink, including the ones not indexed yet</a></p>
  </div>
</section>

<section class="band alt">
  <div class="wrap narrow">
    <h2>Questions</h2>
    ${faq}
  </div>
</section>`;

  return layout({
    title: "OpenIce — stick & puck, pickup, and public skate near Peabody, MA",
    description: "Every publicly posted stick & puck, pickup hockey, and public skate session at rinks near Peabody, Massachusetts.",
    active: "home",
    body
  });
}

/* ------------------------------------------------------------------ search */

export function searchPage({ query, result, rinks, location, error, updatedAt }) {
  const summary = error
    ? `<p class="notice error">${escapeHtml(error)}</p>`
    : `<p class="summary">Showing <strong>${result.total}</strong> ${result.total === 1 ? "session" : "sessions"}
       ${query.rink ? `at <strong>${escapeHtml(rinks.find(rink => rink.id === query.rink)?.name ?? "one rink")}</strong>` : "from <strong>all rinks</strong>"}
       ${location ? `within <strong>${query.radius} miles</strong> of <strong>${escapeHtml(location.place)} ${escapeHtml(location.zip)}</strong>` : ""}.</p>`;

  const empty = `<div class="empty">
    <h2>Nothing on the board for that search.</h2>
    <p>Rinks post walk-on ice a week or two ahead, so an empty week is normal rather than a bug.
       Widening the radius or clearing the weekday filter usually helps.</p>
    ${result.rinksOutOfRange.length ? `<p class="fine">${result.rinksOutOfRange.length}
      ${result.rinksOutOfRange.length === 1 ? "rink was" : "rinks were"} excluded by the ${query.radius}-mile radius.</p>` : ""}
  </div>`;

  const body = `<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span>/</span> Search results</nav>
  ${searchForm({ query, rinks })}
  ${summary}
  ${result.total === 0 && !error ? empty : dayGroups(result.days)}
  <p class="fine checked">Schedules last checked ${escapeHtml(lastChecked(updatedAt))}.
    <a href="/about">How this works</a></p>
</div>`;

  return layout({
    title: "Search results — OpenIce",
    description: "Search stick & puck, pickup hockey, and public skate sessions by ZIP code and radius.",
    active: "search",
    body
  });
}

/* ------------------------------------------------------------------- rinks */

export function rinksPage({ sources, sourceStatus, events, updatedAt }) {
  const cards = sources.map(source => {
    const status = sourceStatus[source.id];
    const count = events.filter(event => event.rinkId === source.id).length;
    return `<article class="rink-card">
      <div>
        <h2><a href="/rinks/${attr(source.id)}">${escapeHtml(source.name)}</a></h2>
        <p class="event-where">${icon("pin")}${escapeHtml(source.address ?? source.town)}</p>
        <p class="fine">${escapeHtml(source.notes ?? "")}</p>
      </div>
      <div class="rink-card-side">
        ${stateBadge(status)}
        <p class="count">${source.enabled ? `${count} upcoming` : "—"}</p>
      </div>
    </article>`;
  }).join("");

  const body = `<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span>/</span> Rinks</nav>
  <h1>Rinks</h1>
  <p class="section-lede">Every rink this app knows about, including the ones it deliberately does
    not index yet. Last checked ${escapeHtml(lastChecked(updatedAt))}.</p>
  <div class="rink-cards">${cards}</div>
</div>`;

  return layout({ title: "Rinks — OpenIce", active: "rinks", body,
    description: "Rinks indexed by OpenIce and their schedule-source health." });
}

export function rinkPage({ source, status, days, total }) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(source.address ?? source.name)}`;
  const body = `<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span>/</span>
    <a href="/rinks">Rinks</a> <span>/</span> ${escapeHtml(source.name)}</nav>
  <header class="rink-header">
    <div>
      <h1>${escapeHtml(source.name)}</h1>
      <p class="event-where">${icon("pin")}${escapeHtml(source.address ?? source.town)}</p>
      <p class="rink-actions">
        <a class="button" href="${attr(source.sourceUrl)}" target="_blank" rel="noreferrer noopener">Rink schedule ${icon("external")}</a>
        <a class="button ghost" href="${attr(mapUrl)}" target="_blank" rel="noreferrer noopener">Directions</a>
      </p>
    </div>
    <div class="rink-card-side">${stateBadge(status)}
      <p class="count">${total} upcoming</p></div>
  </header>
  ${source.notes ? `<p class="notice">${escapeHtml(source.notes)}</p>` : ""}
  ${total === 0
    ? `<div class="empty"><h2>No sessions posted right now.</h2>
       <p>${source.enabled
         ? "The schedule is being read successfully — this rink simply has nothing walk-on posted for the next 60 days."
         : "This rink is not indexed yet, because it does not publish a schedule this app can read reliably."}</p></div>`
    : dayGroups(days)}
</div>`;
  return layout({ title: `${source.name} — OpenIce`, active: "rinks", body,
    description: `Upcoming stick & puck, pickup, and public skate sessions at ${source.name}, ${source.town}.` });
}

/* ------------------------------------------------------------- about / 404 */

export function aboutPage({ sources, sourceStatus, updatedAt }) {
  const rows = sources.map(source => {
    const status = sourceStatus[source.id];
    return `<tr>
      <th scope="row">${escapeHtml(source.name)}</th>
      <td>${escapeHtml(source.adapter ?? "—")}</td>
      <td>${stateBadge(status)}</td>
      <td class="fine">${escapeHtml(status?.message ?? "")}</td>
    </tr>`;
  }).join("");

  const body = `<div class="wrap narrow">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span>/</span> About</nav>
  <h1>About</h1>
  <p class="lede">This reads the schedule pages that rinks near Peabody already publish, and puts
    the walk-on sessions in one list so you do not have to check six sites before deciding where to skate.</p>

  <h2>The rules it follows</h2>
  <ul class="rules">
    <li>Only publicly reachable schedule pages and public calendar feeds. Never a booking system, never an account login.</li>
    <li>A session is listed only when the rink's own title says what it is — stick &amp; puck, stick time, pickup, open hockey, or a public skate.</li>
    <li>Every session keeps a link back to the page it came from, so you can confirm before travelling.</li>
    <li>A source that fetches cleanly but has nothing posted stays visible as healthy. Empty is an answer; a guess is not.</li>
    <li>When a published schedule's wording changes, the source stops rather than carrying a stale semester forward.</li>
  </ul>

  <h2>What it will not tell you</h2>
  <p>Whether the session is actually running. Rinks pull walk-on ice for rentals, tournaments and
    repairs, often the same day, and most do not update the public page when they do. Distance is
    straight-line from your ZIP's centre, not drive time.</p>

  <h2>Source health</h2>
  <p class="fine">Last checked ${escapeHtml(lastChecked(updatedAt))}.</p>
  <table class="sources-table">
    <thead><tr><th scope="col">Rink</th><th scope="col">Adapter</th><th scope="col">State</th><th scope="col">Last message</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p><button class="button" id="refresh" type="button">${icon("refresh")}<span>Refresh now</span></button></p>
</div>`;
  return layout({ title: "About — OpenIce", active: "about", body,
    description: "How OpenIce collects rink schedules, and the rules it follows." });
}

export function notFoundPage() {
  return layout({
    title: "Not found — OpenIce",
    active: "",
    body: `<div class="wrap narrow"><h1>Not found</h1>
      <p>That page isn't here. <a href="/search">Find ice</a> or head <a href="/">home</a>.</p></div>`
  });
}

export { lastChecked };
