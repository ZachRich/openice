const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIcalSchedule(ics, source, { from = new Date(), days = 60 } = {}) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const windowEnd = new Date(from.getTime() + days * DAY_MS);
  const overridden = collectOverrides(blocks);
  const seen = new Set();
  const events = [];

  for (const block of blocks) {
    const fields = readFields(block);
    const summary = decodeIcal(fields.SUMMARY ?? "");
    const type = classifyIceEvent(summary);
    if (!type || fields.STATUS === "CANCELLED") continue;

    const start = parseIcalDate(fields.DTSTART);
    const end = parseIcalDate(fields.DTEND) ?? addMinutes(start, 60);
    if (!start) continue;
    const duration = Math.max(5, Math.round((end - start) / 60000));
    const uid = fields.UID ?? summary;
    const skip = exceptionDates(fields.EXDATE);
    // A VEVENT carrying RECURRENCE-ID replaces one instance of a series. The master rule
    // must stop generating that slot, whether the replacement cancels it or moves it.
    if (!fields["RECURRENCE-ID"]) for (const iso of overridden.get(uid) ?? []) skip.add(iso);

    for (const occurrence of expandOccurrences(start, fields.RRULE, from, windowEnd)) {
      if (skip.has(occurrence.toISOString())) continue;
      const key = `${source.id}:${uid}:${occurrence.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        id: key,
        rinkId: source.id,
        rink: source.name,
        town: source.town,
        address: source.address,
        latitude: source.latitude,
        longitude: source.longitude,
        title: summary,
        type,
        start: occurrence.toISOString(),
        end: addMinutes(occurrence, duration).toISOString(),
        registrationUrl: source.sourceUrl,
        sourceUrl: source.sourceUrl,
        description: decodeIcal(fields.DESCRIPTION ?? ""),
        pulledAt: new Date().toISOString()
      });
    }
  }
  return events;
}

function readFields(block) {
  const result = {};
  for (const line of block.split(/\r?\n/)) {
    const divider = line.indexOf(":");
    if (divider < 0) continue;
    const name = line.slice(0, divider).split(";")[0];
    const value = line.slice(divider + 1);
    // EXDATE is allowed to repeat across lines; keep every value instead of the last one.
    result[name] = name === "EXDATE" && result.EXDATE ? `${result.EXDATE},${value}` : value;
  }
  return result;
}

function parseIcalDate(value) {
  if (!value) return null;
  const clean = value.replace(/[^0-9TZ]/g, "");
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", z] = match;
  if (z) return new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  // Calendar fields without a trailing Z are local wall-clock times. This tool is
  // scoped to Eastern Time, including the daylight-saving transition.
  return easternToUtc(+year, +month, +day, +hour, +minute, +second);
}

export function easternToUtc(year, month, day, hour, minute, second) {
  let guess = Date.UTC(year, month - 1, day, hour + 5, minute, second);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(guess)).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    const observed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += wanted - observed;
  }
  return new Date(guess);
}

function collectOverrides(blocks) {
  const overrides = new Map();
  for (const block of blocks) {
    const fields = readFields(block);
    const recurrenceId = parseIcalDate(fields["RECURRENCE-ID"]);
    if (!recurrenceId) continue;
    const uid = fields.UID ?? "";
    if (!overrides.has(uid)) overrides.set(uid, new Set());
    overrides.get(uid).add(recurrenceId.toISOString());
  }
  return overrides;
}

function exceptionDates(value) {
  const dates = new Set();
  for (const part of (value ?? "").split(",")) {
    const date = parseIcalDate(part);
    if (date) dates.add(date.toISOString());
  }
  return dates;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// A calendar date held as noon UTC, so adding a day is always exactly one day.
function civilDay(year, month, day) { return Date.UTC(year, month - 1, day, 12); }

export function easternParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

// Recurrence is counted in Eastern calendar days, not in UTC. Stepping through UTC would
// shift a series by an hour once daylight saving ends, and would read the weekday of the
// wrong day for any evening session (8:15 PM Thursday is already Friday in UTC).
function expandOccurrences(start, rrule, from, through) {
  if (!rrule) return start >= from && start <= through ? [start] : [];
  const rule = Object.fromEntries(rrule.split(";").map(item => item.split("=")));
  const weekly = rule.FREQ === "WEEKLY";
  const daily = rule.FREQ === "DAILY";
  if (!weekly && !daily) return start >= from && start <= through ? [start] : [];

  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = Number(rule.COUNT ?? Infinity);
  const until = parseIcalDate(rule.UNTIL);
  const byDay = (rule.BYDAY ?? "").split(",").filter(Boolean).map(day => day.slice(-2));
  const wall = easternParts(start);
  const firstDay = civilDay(wall.year, wall.month, wall.day);
  const startWeekday = new Date(firstDay).getUTCDay();

  const result = [];
  let generated = 0;
  const hardStop = Math.min(1000, count);

  for (let cursor = firstDay; generated < hardStop; cursor += DAY_MS) {
    const day = new Date(cursor);
    const occurrence = easternToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), wall.hour, wall.minute, wall.second);
    if (occurrence > through) break;
    if (until && occurrence > until) break;

    const dayOffset = Math.round((cursor - firstDay) / DAY_MS);
    const include = daily
      ? dayOffset % interval === 0
      : Math.floor(dayOffset / 7) % interval === 0 && (byDay.length === 0
        ? day.getUTCDay() === startWeekday
        : byDay.includes(WEEKDAY_CODES[day.getUTCDay()]));
    if (!include) continue;

    // COUNT limits what the rule generates; EXDATE removes some of them afterwards.
    generated++;
    if (occurrence >= from) result.push(occurrence);
  }
  return result;
}

// Lessons, clinics and figure-skating ice are not walk-on sessions, and several rinks
// title them with words that would otherwise match below ("Learn To Skate").
const NOT_A_WALK_ON = /learn[ -]?to[ -]?skate|skating (?:lesson|school|class)|clinic|freestyle|figure skat|hockey (?:league|game|practice|clinic|camp)|tournament|birthday/;

export function classifyIceEvent(title) {
  const text = title.toLowerCase();
  if (NOT_A_WALK_ON.test(text)) return null;
  if (/pick[ -]?up hockey|open hockey|drop[ -]?in hockey/.test(text)) return "pickup";
  if (/stick\s*(?:&|and|n)?\s*puck|stick\s*(?:time|practice)/.test(text)) return "stick-puck";
  if (/public skate|open skate|family skate|community skate|open freeskate/.test(text)) return "public-skate";
  return null;
}

/** @deprecated kept so older callers keep working; use classifyIceEvent. */
export const classifyHockeyEvent = classifyIceEvent;

function decodeIcal(value) {
  return value.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}

function addMinutes(date, minutes) { return date ? new Date(date.getTime() + minutes * 60000) : null; }
