import { classifyIceEvent, easternToUtc } from "./ical.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseMyRecSchedule(html, source, { from = new Date(), days = 60 } = {}) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const until = new Date(from.getTime() + days * DAY_MS);
  let currentDate = null;
  const events = [];

  for (const row of rows) {
    const text = textOnly(row);
    const dateMatch = text.match(/^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i);
    if (dateMatch) {
      currentDate = dateParts(dateMatch[1], dateMatch[2], dateMatch[3]);
      continue;
    }
    if (!currentDate) continue;
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s+(.+)/i);
    if (!timeMatch) continue;
    const [, startsAt, endsAt, title] = timeMatch;
    const type = classifyIceEvent(title);
    if (!type) continue;
    const start = easternFromParts(currentDate, startsAt);
    const end = easternFromParts(currentDate, endsAt);
    if (!start || !end || start < from || start > until) continue;
    events.push(eventFrom(source, { title, type, start, end, description: source.notes ?? "Public schedule; verify restrictions before traveling." }));
  }
  return dedupe(events);
}

export function parseWeeklySchedule(page, source, { from = new Date(), days = 60 } = {}) {
  if (source.requiredText && !page.toLowerCase().includes(source.requiredText.toLowerCase())) {
    throw new Error("The published schedule wording changed; this source needs review.");
  }
  const until = new Date(from.getTime() + days * DAY_MS);
  const events = [];
  for (const rule of source.rules ?? []) {
    const first = new Date(`${rule.startsOn}T12:00:00Z`);
    const last = new Date(`${rule.endsOn}T23:59:59Z`);
    for (const cursor = new Date(first); cursor <= last && cursor <= until; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (!rule.weekdays.includes(cursor.getUTCDay())) continue;
      const start = easternFromDate(cursor, rule.start);
      const end = new Date(start.getTime() + rule.durationMinutes * 60000);
      if (start >= from && start <= until) events.push(eventFrom(source, { title: rule.title, type: rule.type ?? "stick-puck", start, end, description: rule.description ?? source.notes ?? "Check rink site before traveling." }));
    }
  }
  return events;
}

function eventFrom(source, { title, type, start, end, description }) {
  return {
    id: `${source.id}:${start.toISOString()}:${title}`,
    rinkId: source.id,
    rink: source.name,
    town: source.town,
    address: source.address,
    latitude: source.latitude,
    longitude: source.longitude,
    title: title.trim(), type, start: start.toISOString(), end: end.toISOString(),
    registrationUrl: source.sourceUrl, sourceUrl: source.sourceUrl, description,
    pulledAt: new Date().toISOString()
  };
}

function textOnly(html) {
  return decode(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function decode(value) {
  return value.replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&#39;/g, "'").replace(/&quot;/gi, '"');
}

function dateParts(monthName, day, year) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  return { year: Number(year), month: months.indexOf(monthName.toLowerCase()) + 1, day: Number(day) };
}

function easternFromParts(date, time) {
  const match = time.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  return easternToUtc(date.year, date.month, date.day, hour, Number(match[2]), 0);
}

function easternFromDate(date, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return easternToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, 0);
}

function dedupe(events) { return [...new Map(events.map(event => [event.id, event])).values()]; }
