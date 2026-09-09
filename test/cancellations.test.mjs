// Real markup, captured from the McVann-O'Keefe public calendar on 9 Sep 2026 with
// `npm run capture`. These four series are the ones that made the collected total drop
// from 52 sessions to 24 the first time recurrence exceptions were honoured: the rink
// had cancelled that much ice, and the old parser was advertising all of it.
import test from "node:test";
import assert from "node:assert/strict";
import { parseIcalSchedule } from "../src/ical.mjs";
import { fixture, source, eastern } from "./helpers.mjs";

const from = new Date("2026-09-09T13:41:01.568Z");

function collected() {
  return parseIcalSchedule(fixture("peabody-cancellations.ics"), source({ id: "peabody" }), { from, days: 60 });
}

const days = () => collected().map(event => eastern(event.start));

test("a weekday cancelled out of a two-day series disappears, and the other day survives", () => {
  // FREQ=WEEKLY;BYDAY=TH,TU with an EXDATE on every Thursday in the run.
  const noon = days().filter(day => day.endsWith("12:00"));
  assert.deepEqual(noon, ["2026-09-29 12:00", "2026-10-06 12:00", "2026-10-13 12:00", "2026-10-20 12:00", "2026-10-27 12:00"]);
  assert.ok(noon.every(day => new Date(`${day.slice(0, 10)}T12:00`).getDay() === 2), "every survivor is a Tuesday");
});

test("a series cancelled for its whole run produces nothing", () => {
  // The Sunday 5pm series runs to 30 Nov but every Sunday in it is an EXDATE.
  assert.deepEqual(days().filter(day => day.endsWith("17:00")), []);
});

test("a series cancelled for part of its run keeps the rest", () => {
  // Sunday 1pm, with the three September Sundays excluded.
  assert.deepEqual(days().filter(day => day.endsWith("13:00")),
    ["2026-10-04 13:00", "2026-10-11 13:00", "2026-10-18 13:00", "2026-10-25 13:00", "2026-11-01 13:00"]);
});

test("a moved session appears once, at its new time", () => {
  // The 11 Sep session was moved 8:15pm -> 9:15pm by a RECURRENCE-ID override, and every
  // later Friday was cancelled. Showing it at both times is the bug this guards.
  const fridays = days().filter(day => day.startsWith("2026-09-11"));
  assert.deepEqual(fridays, ["2026-09-11 21:15"]);
  assert.ok(!days().includes("2026-09-11 20:15"), "the original slot must not also be listed");
});

test("an evening series keeps the weekday the rink published", () => {
  // DTSTART is Friday 8:15pm Eastern, which is Saturday in UTC. Counting occurrences in
  // UTC moved this series by a day; it must stay on Friday.
  const evening = collected().find(event => eastern(event.start).endsWith("21:15"));
  assert.equal(new Date(evening.start).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" }), "Friday");
});

test("the fixture collects exactly the sessions the rink still lists", () => {
  assert.equal(collected().length, 11);
});
