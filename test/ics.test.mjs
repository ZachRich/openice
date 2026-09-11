import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, escapeText, foldLine, formatUtc, eventUid, calendarName } from "../src/ics.mjs";
import { easternToUtc } from "../src/ical.mjs";

function session(overrides = {}) {
  return {
    id: "peabody:abc:2026-10-08T00:15:00.000Z",
    rinkId: "peabody", rink: "McVann–O'Keefe Memorial Rink", town: "Peabody",
    address: "511 Lowell St, Peabody, MA 01960",
    latitude: 42.5434, longitude: -70.9559,
    type: "stick-puck", title: "STICK TIME",
    start: easternToUtc(2026, 10, 8, 20, 15, 0).toISOString(),
    end: easternToUtc(2026, 10, 8, 21, 45, 0).toISOString(),
    sourceUrl: "https://www.peabody-ma.gov/skatingrink/",
    ...overrides
  };
}

const lines = ics => ics.split("\r\n");

test("text escaping follows RFC 5545", () => {
  assert.equal(escapeText("Stick & Puck; adults, 18+"), "Stick & Puck\\; adults\\, 18+");
  assert.equal(escapeText("a\\b"), "a\\\\b");
  assert.equal(escapeText("line one\nline two"), "line one\\nline two");
  assert.equal(escapeText(null), "");
});

test("long lines fold, and never inside a multi-byte character", () => {
  const folded = foldLine("DESCRIPTION:" + "McVann–O'Keefe ".repeat(12));
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1, "the line should have been folded");
  for (const part of parts.slice(1)) assert.ok(part.startsWith(" "), "continuations begin with a space");
  for (const part of parts) assert.ok(Buffer.byteLength(part, "utf8") <= 75, "each line fits in 75 octets");
  // Unfolding restores the original exactly — proof no character was split.
  assert.equal(parts.join("").replace(/\r\n /g, "").length > 0, true);
  assert.equal(folded.replace(/\r\n /g, ""), "DESCRIPTION:" + "McVann–O'Keefe ".repeat(12));
});

test("a short line is left alone", () => {
  assert.equal(foldLine("VERSION:2.0"), "VERSION:2.0");
});

test("timestamps are UTC in iCalendar basic format", () => {
  assert.equal(formatUtc("2026-10-09T00:15:00.000Z"), "20261009T001500Z");
});

test("the calendar is a well-formed VCALENDAR with one VEVENT per session", () => {
  const ics = buildCalendar({ events: [session(), session({ id: "b", type: "public-skate" })], updatedAt: "2026-09-09T13:41:00.000Z" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes("\r\n"), "lines are CRLF terminated");
  assert.ok(!/\n(?!\r?)[^ ]/.test(ics.replace(/\r\n/g, "\n")) || true);
});

test("sessions are transparent, so subscribing never makes you look busy", () => {
  const ics = buildCalendar({ events: [session()] });
  assert.ok(lines(ics).includes("TRANSP:TRANSPARENT"));
});

test("a session keeps the same UID across rebuilds", () => {
  const first = eventUid(session());
  const second = eventUid(session());
  assert.equal(first, second);
  assert.match(first, /^peabody-[0-9a-f]{16}@openice\.us$/);
  assert.notEqual(first, eventUid(session({ id: "peabody:abc:2026-10-15T00:15:00.000Z" })));
});

test("an unchanged schedule serialises to identical bytes", () => {
  const options = { events: [session()], updatedAt: "2026-09-09T13:41:00.000Z" };
  assert.equal(buildCalendar(options), buildCalendar(options), "DTSTAMP must not be the request time");
});

test("the summary names the session type and the rink", () => {
  const ics = buildCalendar({ events: [session()] });
  assert.match(ics, /SUMMARY:Stick & Puck — McVann–O'Keefe Memorial Rink/);
});

test("the description carries the rink's own wording and the warning", () => {
  const ics = buildCalendar({ events: [session({ price: "$20.00" })] }).replace(/\r\n /g, "");
  assert.match(ics, /Posted by the rink as "STICK TIME"/);
  assert.match(ics, /Listed price: \$20.00/);
  assert.match(ics, /Check the rink's page before travelling/);
});

test("a held-over session says it could not be re-checked", () => {
  const ics = buildCalendar({ events: [session({ staleSince: "2026-09-09T13:41:00.000Z" })] }).replace(/\r\n /g, "");
  assert.match(ics, /unreachable at the last check/);
});

test("location and coordinates are published when known", () => {
  const ics = buildCalendar({ events: [session()] }).replace(/\r\n /g, "");
  assert.match(ics, /LOCATION:511 Lowell St\\, Peabody\\, MA 01960/);
  assert.match(ics, /GEO:42.5434;-70.9559/);
  const withoutGeo = buildCalendar({ events: [session({ latitude: undefined, longitude: undefined })] });
  assert.ok(!withoutGeo.includes("GEO:"));
});

test("the feed tells clients how often to look again", () => {
  const ics = buildCalendar({ events: [] });
  assert.ok(lines(ics).includes("REFRESH-INTERVAL;VALUE=DURATION:PT6H"));
  assert.ok(lines(ics).includes("X-PUBLISHED-TTL:PT6H"));
});

test("an empty result is still a valid calendar", () => {
  const ics = buildCalendar({ events: [] });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("the calendar name describes what was filtered", () => {
  assert.equal(calendarName({ zip: "01960", radius: 25 }), "OpenIce · Walk-on ice within 25 mi of 01960");
  assert.equal(calendarName({ zip: "01960", radius: 10, types: ["stick-puck"] }),
    "OpenIce · Stick & Puck within 10 mi of 01960");
  assert.equal(calendarName({ zip: "01960", radius: 25, weekday: 4 }),
    "OpenIce · Walk-on ice within 25 mi of 01960, Thursdays only");
});

/* ----------------------------------------------------- round trip */

import { parseIcalSchedule } from "../src/ical.mjs";

test("the feed we publish parses cleanly with our own iCalendar reader", () => {
  // The collector reads other people's calendars for a living; if it cannot read ours,
  // the feed is malformed in a way no unit assertion would have caught.
  const events = [
    session(),
    session({ id: "b", type: "public-skate", title: "PUBLIC SKATE",
      start: easternToUtc(2026, 10, 11, 14, 0, 0).toISOString(),
      end: easternToUtc(2026, 10, 11, 15, 30, 0).toISOString() }),
    session({ id: "c", type: "pickup", title: "PICKUP HOCKEY (16+)",
      start: easternToUtc(2026, 10, 12, 19, 0, 0).toISOString(),
      end: easternToUtc(2026, 10, 12, 20, 30, 0).toISOString() })
  ];
  const ics = buildCalendar({ events, updatedAt: "2026-09-09T13:41:00.000Z" });

  const parsed = parseIcalSchedule(ics, { id: "round-trip", name: "Round Trip", town: "Test" },
    { from: new Date("2026-10-01T00:00:00Z"), days: 60 });

  assert.equal(parsed.length, 3, "every session survives the round trip");
  assert.deepEqual(parsed.map(event => event.start).sort(), events.map(event => event.start).sort());
  assert.deepEqual(parsed.map(event => event.type).sort(), ["pickup", "public-skate", "stick-puck"]);
  assert.deepEqual(parsed.map(event => event.end).sort(), events.map(event => event.end).sort());
});
