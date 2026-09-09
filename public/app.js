const schedule = document.querySelector("#schedule");
const sourceList = document.querySelector("#source-list");
const updated = document.querySelector("#updated");
const days = document.querySelector("#days");
const pickup = document.querySelector("#pickup");
const refreshButton = document.querySelector("#refresh");
const template = document.querySelector("#event-template");

const formatDay = new Intl.DateTimeFormat("en-US", { weekday:"short", month:"short", day:"numeric", timeZone:"America/New_York" });
const formatTime = new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit", timeZone:"America/New_York" });

async function load() {
  schedule.innerHTML = '<p class="loading">Loading schedules…</p>';
  const data = await fetch(`/api/events?days=${days.value}&pickup=${pickup.checked}`).then(response => response.json());
  renderEvents(data.events);
  renderSources(data.sourceStatus);
  updated.textContent = data.updatedAt ? `Last checked ${new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}).format(new Date(data.updatedAt))}` : "Not yet checked";
}

function renderEvents(events) {
  schedule.innerHTML = "";
  if (!events.length) { schedule.innerHTML = '<p class="empty">No matching ice sessions yet. Try refreshing—or add a calendar feed for another rink below.</p>'; return; }
  const byDay = Object.groupBy(events, event => formatDay.format(new Date(event.start)));
  for (const [day, rows] of Object.entries(byDay)) {
    const group = document.createElement("section"); group.className = "day";
    const label = document.createElement("div"); label.className = "day-label"; label.textContent = day; group.append(label);
    const cards = document.createElement("div");
    for (const event of rows) {
      const card = template.content.cloneNode(true);
      card.querySelector(".date").textContent = `${formatTime.format(new Date(event.start))} – ${formatTime.format(new Date(event.end))}`;
      card.querySelector("h3").textContent = event.title;
      const badge = card.querySelector(".badge"); badge.textContent = event.type === "pickup" ? "Pickup" : "Stick & puck"; badge.classList.toggle("pickup", event.type === "pickup");
      card.querySelector(".where").textContent = `${event.rink} · ${event.town}${event.distanceMiles ? ` · ${event.distanceMiles} mi` : ""}`;
      card.querySelector(".notes").textContent = event.description || "Check rink site for price, restrictions, and registration.";
      card.querySelector(".go").href = event.registrationUrl;
      cards.append(card);
    }
    group.append(cards); schedule.append(group);
  }
}

function renderSources(statuses) {
  sourceList.innerHTML = "";
  for (const [id, status] of Object.entries(statuses ?? {})) {
    const item = document.createElement("div"); item.className = "source";
    item.innerHTML = `<span class="dot ${status.state}"></span><div><strong>${id.replaceAll("-", " ")}</strong><small>${status.message ?? status.state}${typeof status.count === "number" ? ` · ${status.count} sessions` : ""}</small></div>`;
    sourceList.append(item);
  }
}

days.addEventListener("change", load); pickup.addEventListener("change", load);
refreshButton.addEventListener("click", async () => { refreshButton.disabled = true; refreshButton.textContent = "Refreshing…"; try { await fetch("/api/refresh", { method:"POST" }); await load(); } finally { refreshButton.disabled = false; refreshButton.textContent = "Refresh schedules"; } });
load().catch(error => { schedule.innerHTML = `<p class="empty">Couldn’t load schedules: ${error.message}</p>`; });
