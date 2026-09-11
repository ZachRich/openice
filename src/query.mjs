import { easternToUtc, easternParts } from "./ical.mjs";
import { distanceMiles } from "./geo.mjs";

export const SESSION_TYPES = [
  { id: "stick-puck", label: "Stick & Puck", blurb: "Walk-on ice for skating and shooting." },
  { id: "pickup", label: "Pickup Hockey", blurb: "Drop-in games, usually age-restricted." },
  { id: "public-skate", label: "Public Skate", blurb: "Open skating for everyone." }
];

export const TYPE_IDS = SESSION_TYPES.map(type => type.id);

export const WEEKDAYS = [
  { id: 0, label: "Sunday" }, { id: 1, label: "Monday" }, { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" }, { id: 4, label: "Thursday" }, { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" }
];

/** Start-hour choices for the time-of-day filter. Rinks rarely sell walk-on ice before 5am. */
export const HOUR_CHOICES = Array.from({ length: 19 }, (unused, index) => {
  const hour = index + 5;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return { value: hour, label: `${display}:00 ${suffix}` };
});

export const DEFAULT_RADIUS_MILES = 25;
export const RADIUS_CHOICES = [5, 10, 25, 50];

const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"
});
const shortDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short", month: "long", day: "numeric"
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "numeric", minute: "2-digit"
});
const isoDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
});

/** "2026-09-09" for the Eastern calendar day an instant falls on. */
export function easternDay(value) {
  return isoDayFormat.format(new Date(value));
}

export function easternWeekday(value) {
  const parts = easternParts(new Date(value));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/**
 * A time-of-day bound, as minutes since midnight.
 *
 * The dropdowns offer whole hours, which is the right granularity to click. A hand-written
 * query can be finer: rinks really do start sessions at 4:15, and rounding that down to 4
 * quietly widens the filter. So a bare hour means the whole hour, and "16:15" means exactly
 * that minute.
 */
export function parseTimeOfDay(value, { endOfHour = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();

  const precise = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (precise) {
    const hours = Number(precise[1]);
    return hours <= 23 ? hours * 60 + Number(precise[2]) : null;
  }

  const hour = Number(text);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return endOfHour ? hour * 60 + 59 : hour * 60;
}

/** "4:15pm", for saying back what a bound did. */
export function formatTimeOfDay(value) {
  const minutes = parseTimeOfDay(value);
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? "am" : "pm";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  const rest = minutes % 60;
  return rest === 0 ? `${display}${suffix}` : `${display}:${String(rest).padStart(2, "0")}${suffix}`;
}

/** Minutes since midnight, Eastern, for the day the session starts on. */
export function easternMinutes(value) {
  const parts = easternParts(new Date(value));
  return parts.hour * 60 + parts.minute;
}

export function formatDayLabel(value) { return dayLabelFormat.format(new Date(value)); }
export function formatShortDay(value) { return shortDayFormat.format(new Date(value)); }
/** "8:15 – 9:45 PM", but "11:45 AM – 1:30 PM" when the range crosses noon or midnight. */
export function formatTimeRange(start, end) {
  const from = timeFormat.format(new Date(start));
  const to = timeFormat.format(new Date(end));
  const fromMeridiem = from.slice(-2);
  return fromMeridiem === to.slice(-2)
    ? `${from.slice(0, -3)} – ${to}`
    : `${from} – ${to}`;
}

/** Midnight Eastern on a YYYY-MM-DD date, as a UTC instant. */
function easternMidnight(isoDate, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? "").trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return endOfDay
    ? easternToUtc(+year, +month, +day, 23, 59, 59)
    : easternToUtc(+year, +month, +day, 0, 0, 0);
}

/**
 * Applies every filter the search page offers and returns the events grouped by
 * Eastern calendar day. Distance is computed here, against the searched location,
 * rather than being baked into the stored event.
 */
export function searchEvents(events, options = {}) {
  const {
    origin = null,
    radiusMiles = null,
    types = TYPE_IDS,
    rinkId = null,
    weekday = null,
    startDate = null,
    endDate = null,
    afterHour = null,
    beforeHour = null,
    now = new Date()
  } = options;

  const wanted = new Set(types.filter(type => TYPE_IDS.includes(type)));
  const from = easternMidnight(startDate) ?? now;
  const until = easternMidnight(endDate, true);
  const rinksOutOfRange = new Set();

  const matched = [];
  for (const event of events) {
    if (!wanted.has(event.type)) continue;

    const start = new Date(event.start);
    if (start < now || start < from) continue;
    if (until && start > until) continue;
    if (rinkId && event.rinkId !== rinkId) continue;
    if (weekday !== null && weekday !== undefined && easternWeekday(start) !== Number(weekday)) continue;

    // Time of day is matched on when the session starts, in Eastern wall-clock terms:
    // "earliest 6 AM" keeps a 6:00 start, "latest 9 PM" keeps a 9:45 PM one.
    if (afterHour !== null || beforeHour !== null) {
      const minutes = easternMinutes(start);
      const earliest = parseTimeOfDay(afterHour);
      const latest = parseTimeOfDay(beforeHour, { endOfHour: true });
      if (earliest !== null && minutes < earliest) continue;
      if (latest !== null && minutes > latest) continue;
    }

    const miles = origin
      ? distanceMiles(origin.latitude, origin.longitude, event.latitude, event.longitude)
      : null;
    if (radiusMiles && miles !== null && miles > radiusMiles) { rinksOutOfRange.add(event.rinkId); continue; }

    matched.push({ ...event, distanceMiles: miles });
  }

  matched.sort((a, b) => new Date(a.start) - new Date(b.start));

  const days = [];
  let current = null;
  for (const event of matched) {
    const key = easternDay(event.start);
    if (!current || current.date !== key) {
      current = { date: key, label: formatDayLabel(event.start), events: [] };
      days.push(current);
    }
    current.events.push(event);
  }

  return {
    events: matched,
    days,
    total: matched.length,
    rinkIds: [...new Set(matched.map(event => event.rinkId))],
    rinksOutOfRange: [...rinksOutOfRange]
  };
}

/** Rinks that have at least one future session, for the search page's rink filter. */
export function rinkOptions(events, sources) {
  const seen = new Set(events.map(event => event.rinkId));
  return sources
    .filter(source => seen.has(source.id))
    .map(source => ({ id: source.id, name: source.name, town: source.town }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The parsed query, back as a query string, so a page can link to its own feed. */
export function toSearchParams(query = {}) {
  const params = new URLSearchParams();
  if (query.zip) params.set("zip", query.zip);
  if (query.radius) params.set("radius", String(query.radius));
  for (const type of query.types ?? []) {
    if (TYPE_IDS.length !== (query.types ?? []).length) params.append("type", type);
  }
  if (query.rink) params.set("rink", query.rink);
  if (query.weekday !== null && query.weekday !== undefined) params.set("weekday", String(query.weekday));
  if (query.start) params.set("start", query.start);
  if (query.end) params.set("end", query.end);
  if (query.after !== null && query.after !== undefined) params.set("after", String(query.after));
  if (query.before !== null && query.before !== undefined) params.set("before", String(query.before));
  return params.toString();
}

export function typeLabel(id) {
  return SESSION_TYPES.find(type => type.id === id)?.label ?? id;
}
