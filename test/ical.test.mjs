import test from "node:test";
import assert from "node:assert/strict";
import { parseIcalSchedule, classifyIceEvent, easternToUtc } from "../src/ical.mjs";
import { fixture, source, eastern, summarize } from "./helpers.mjs";

const from = new Date("2026-10-01T00:00:00Z");
const options = { from, days: 60 };

function peabody() {
  return parseIcalSchedule(fixture("peabody.ics"), source({ id: "peabody" }), options);
}

test("weekly series honours EXDATE", () => {
  const midday = peabody().filter(event => eastern(event.start).endsWith("12:00"));
  const dates = midday.map(event => eastern(event.start));
  assert.ok(!dates.includes("2026-10-13 12:00"), "Oct 13 is an EXDATE and must not appear");
  assert.ok(!dates.includes("2026-11-10 12:00"), "Nov 10 is an EXDATE and must not appear");
  assert.ok(dates.includes("2026-10-06 12:00"), "the first occurrence should survive");
});

test("EXDATE accepts several values on one line", () => {
  const evening = peabody().filter(event => eastern(event.start).endsWith("20:15"));
  const dates = evening.map(event => eastern(event.start));
  assert.deepEqual(dates, [
    "2026-10-08 20:15",
    "2026-10-29 20:15",
    "2026-11-05 20:15",
    "2026-11-12 20:15"
  ]);
});

test("an instance cancelled through RECURRENCE-ID disappears", () => {
  const dates = peabody().map(event => eastern(event.start));
  assert.ok(!dates.includes("2026-10-20 12:00"), "Oct 20 was cancelled and must not be advertised");
});

test("a rescheduled instance moves rather than duplicating", () => {
  const dates = peabody().map(event => eastern(event.start));
  assert.ok(!dates.includes("2026-10-27 12:00"), "the original Oct 27 slot was overridden");
  assert.ok(dates.includes("2026-10-27 14:00"), "the replacement Oct 27 slot should appear");
});

test("a weekly series keeps its Eastern wall-clock time across the DST change", () => {
  const dates = peabody().map(event => eastern(event.start));
  assert.ok(dates.includes("2026-11-03 12:00"), "November occurrences must stay at noon Eastern, not 11:00");
  assert.ok(dates.includes("2026-11-17 12:00"));
  assert.ok(dates.includes("2026-11-24 12:00"));
});

test("BYDAY matches the Eastern weekday for a late-evening series", () => {
  // 8:15 PM Thursday Eastern is Friday in UTC; BYDAY=TH must still match.
  const evening = peabody().filter(event => eastern(event.start).endsWith("20:15"));
  assert.equal(evening.length, 4);
});

test("a cancelled event is excluded", () => {
  assert.equal(peabody().filter(event => eastern(event.start) === "2026-10-14 19:00").length, 0);
});

test("public skate is collected as its own type", () => {
  const skate = peabody().filter(event => event.type === "public-skate");
  assert.equal(skate.length, 1);
  assert.equal(eastern(skate[0].start), "2026-10-12 14:00");
});

test("pickup hockey is classified separately", () => {
  const pickup = peabody().filter(event => event.type === "pickup");
  assert.equal(pickup.length, 1);
  assert.equal(pickup[0].title, "PICKUP HOCKEY (16+)");
  assert.equal(eastern(pickup[0].start), "2026-10-11 13:00", "a Z-suffixed time is a real instant");
});

test("folded lines are unfolded before parsing", () => {
  const event = peabody().find(event => event.description?.includes("Helmets"));
  assert.match(event.description, /full equipment advised/);
});

test("the whole Peabody fixture produces exactly the expected schedule", () => {
  assert.deepEqual(summarize(peabody()).sort(), [
    "2026-10-06 12:00 stick-puck STICK TIME",
    "2026-10-08 20:15 stick-puck STICK TIME",
    "2026-10-11 13:00 pickup PICKUP HOCKEY (16+)",
    "2026-10-12 14:00 public-skate PUBLIC SKATE",
    "2026-10-27 14:00 stick-puck STICK TIME",
    "2026-10-29 20:15 stick-puck STICK TIME",
    "2026-11-03 12:00 stick-puck STICK TIME",
    "2026-11-05 20:15 stick-puck STICK TIME",
    "2026-11-12 20:15 stick-puck STICK TIME",
    "2026-11-17 12:00 stick-puck STICK TIME",
    "2026-11-24 12:00 stick-puck STICK TIME"
  ].sort());
});

test("floating times are read as Eastern on both sides of the DST change", () => {
  const events = parseIcalSchedule(fixture("stoneham.ics"), source({ id: "stoneham" }), options);
  assert.deepEqual(summarize(events), [
    "2026-10-07 12:00 stick-puck ADULT STICK PRACTICE *YOU MUST PRE-REGISTER SPACE LIMITED*",
    "2026-11-04 12:00 stick-puck ADULT STICK PRACTICE *YOU MUST PRE-REGISTER SPACE LIMITED*"
  ]);
  assert.equal(events[0].start, "2026-10-07T16:00:00.000Z", "EDT is UTC-4");
  assert.equal(events[1].start, "2026-11-04T17:00:00.000Z", "EST is UTC-5");
});

test("events carry their rink's details but not a distance", () => {
  const event = peabody()[0];
  assert.equal(event.rink, "Test Rink");
  assert.equal(event.town, "Testville");
  assert.equal(event.sourceUrl, "https://example.org/schedule");
  assert.equal(typeof event.latitude, "number");
  // Distance depends on where the visitor searched from, so it belongs to the query.
  assert.equal(event.distanceMiles, undefined);
});

test("classifyIceEvent recognises the three session types", () => {
  for (const title of ["Stick & Puck", "STICK TIME", "Stick and Puck Time", "Mens' Stick & Puck", "Adult Stick Practice", "stick n puck"]) {
    assert.equal(classifyIceEvent(title), "stick-puck", title);
  }
  for (const title of ["Pickup Hockey", "Pick-up Hockey", "Open Hockey", "Drop-in Hockey"]) {
    assert.equal(classifyIceEvent(title), "pickup", title);
  }
  for (const title of ["Public Skate", "PUBLIC SKATE", "Open Skate", "Family Skate", "Community Skate"]) {
    assert.equal(classifyIceEvent(title), "public-skate", title);
  }
});

test("classifyIceEvent rejects ice you cannot walk on to", () => {
  for (const title of [
    "Learn To Skate", "Learn-to-Skate Level 3", "Skating Lessons", "Freestyle",
    "Figure Skating Club", "Youth Hockey Game", "Adult Hockey League",
    "Mite Hockey Practice", "Holiday Tournament", "Birthday Party Skate", "Broomball", "Curling"
  ]) {
    assert.equal(classifyIceEvent(title), null, title);
  }
});

test("easternToUtc tracks the offset in force on the day", () => {
  assert.equal(easternToUtc(2026, 7, 15, 12, 0, 0).toISOString(), "2026-07-15T16:00:00.000Z");
  assert.equal(easternToUtc(2026, 12, 15, 12, 0, 0).toISOString(), "2026-12-15T17:00:00.000Z");
  assert.equal(easternToUtc(2026, 11, 1, 0, 30, 0).toISOString(), "2026-11-01T04:30:00.000Z");
});
