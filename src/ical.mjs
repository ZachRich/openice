const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIcalSchedule(ics, source, { from = new Date(), days = 60 } = {}) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const windowEnd = new Date(from.getTime() + days * DAY_MS);
  const seen = new Set();
  const events = [];

  for (const block of blocks) {
    const fields = readFields(block);
    const summary = decodeIcal(fields.SUMMARY ?? "");
    const type = classifyHockeyEvent(summary);
    if (!type || fields.STATUS === "CANCELLED") continue;

    const start = parseIcalDate(fields.DTSTART);
    const end = parseIcalDate(fields.DTEND) ?? addMinutes(start, 60);
    if (!start) continue;
    const duration = Math.max(5, Math.round((end - start) / 60000));

    for (const occurrence of expandOccurrences(start, fields.RRULE, from, windowEnd)) {
      const key = `${source.id}:${fields.UID ?? summary}:${occurrence.toISOString()}`;
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
        distanceMiles: distanceMiles(42.5426, -70.9368, source.latitude, source.longitude),
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
    result[name] = line.slice(divider + 1);
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

function expandOccurrences(start, rrule, from, through) {
  if (!rrule) return start >= from && start <= through ? [start] : [];
  const rule = Object.fromEntries(rrule.split(";").map(item => item.split("=")));
  const interval = Number(rule.INTERVAL ?? 1);
  const count = Number(rule.COUNT ?? Infinity);
  const until = parseIcalDate(rule.UNTIL);
  const weekly = rule.FREQ === "WEEKLY";
  const daily = rule.FREQ === "DAILY";
  if (!weekly && !daily) return start >= from && start <= through ? [start] : [];
  const byDay = (rule.BYDAY ?? "").split(",").filter(Boolean);
  const dayIndex = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const result = [];
  const cursor = new Date(start);
  let generated = 0;
  const hardStop = Math.min(1000, count);
  while (cursor <= through && generated < hardStop && (!until || cursor <= until)) {
    const weeksFromStart = Math.floor((cursor - start) / (7 * DAY_MS));
    const include = daily
      ? Math.floor((cursor - start) / DAY_MS) % interval === 0
      : weeksFromStart % interval === 0 && (byDay.length === 0 ? cursor.getUTCDay() === start.getUTCDay() : byDay.includes(Object.keys(dayIndex).find(key => dayIndex[key] === cursor.getUTCDay())));
    if (include) {
      generated++;
      if (cursor >= from) result.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function classifyHockeyEvent(title) {
  const text = title.toLowerCase();
  if (/pick[ -]?up hockey|open hockey/.test(text)) return "pickup";
  if (/stick\s*(?:&|and|n)?\s*puck|stick\s*(?:time|practice)/.test(text)) return "stick-puck";
  return null;
}

function decodeIcal(value) {
  return value.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}

function addMinutes(date, minutes) { return date ? new Date(date.getTime() + minutes * 60000) : null; }

function distanceMiles(lat1, lon1, lat2, lon2) {
  if (!lat2 || !lon2) return null;
  const radians = value => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
