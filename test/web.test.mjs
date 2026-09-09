import test from "node:test";
import assert from "node:assert/strict";
import { parseMyRecSchedule, parseWeeklySchedule } from "../src/web.mjs";
import { fixture, source, eastern, summarize } from "./helpers.mjs";

const from = new Date("2026-10-01T00:00:00Z");
const options = { from, days: 60 };

function arlington() {
  return parseMyRecSchedule(fixture("arlington-myrec.html"), source({ id: "arlington" }), options);
}

test("MyRec rows are attached to the date header above them", () => {
  assert.deepEqual(summarize(arlington()), [
    "2026-10-05 12:00 stick-puck Mens' Stick & Puck",
    "2026-10-05 13:30 stick-puck Womens' Stick & Puck",
    "2026-10-07 10:00 stick-puck Family Stick & Puck",
    "2026-11-05 20:15 stick-puck Mens' Stick & Puck Main Rink"
  ]);
});

test("MyRec ignores non-hockey programs", () => {
  const titles = arlington().map(event => event.title);
  assert.ok(!titles.some(title => /Public Skate|Learn To Skate/i.test(title)));
});

test("MyRec ignores a row that appears before any date header", () => {
  const dates = arlington().map(event => eastern(event.start));
  assert.ok(!dates.some(date => date.endsWith("09:00")), "an undated row has no usable date");
});

test("MyRec respects the collection window at both ends", () => {
  const dates = arlington().map(event => eastern(event.start));
  assert.ok(!dates.some(date => date.startsWith("2026-03")), "March 2026 is before `from`");
  assert.ok(!dates.some(date => date.startsWith("2027-")), "June 2027 is past the window");
});

test("MyRec times are Eastern, including after the DST change", () => {
  const november = arlington().find(event => eastern(event.start).startsWith("2026-11-05"));
  assert.equal(november.start, "2026-11-06T01:15:00.000Z", "8:15 PM EST is 01:15Z the next day");
  assert.equal(november.end, "2026-11-06T02:45:00.000Z");
});

test("MyRec end times come from the row's own range", () => {
  const first = arlington()[0];
  assert.equal(eastern(first.end), "2026-10-05 13:20");
});

const rockett = source({
  id: "rockett-arena",
  name: "Rockett Arena",
  requiredText: "Stick and Puck Time 12-1 pm",
  rules: [{
    title: "Stick and Puck Time",
    type: "stick-puck",
    startsOn: "2026-10-19",
    endsOn: "2026-12-07",
    weekdays: [1],
    start: "12:00",
    durationMinutes: 60,
    description: "Fall 2026 Salem State schedule."
  }]
});

test("the weekly adapter generates the configured weekday only, inside the window", () => {
  const events = parseWeeklySchedule(fixture("salemstate.html"), rockett, options);
  assert.deepEqual(summarize(events), [
    "2026-10-19 12:00 stick-puck Stick and Puck Time",
    "2026-10-26 12:00 stick-puck Stick and Puck Time",
    "2026-11-02 12:00 stick-puck Stick and Puck Time",
    "2026-11-09 12:00 stick-puck Stick and Puck Time",
    "2026-11-16 12:00 stick-puck Stick and Puck Time",
    "2026-11-23 12:00 stick-puck Stick and Puck Time"
  ]);
});

test("the weekly adapter keeps noon Eastern after the DST change", () => {
  const events = parseWeeklySchedule(fixture("salemstate.html"), rockett, options);
  const november = events.find(event => eastern(event.start).startsWith("2026-11-02"));
  assert.equal(november.start, "2026-11-02T17:00:00.000Z");
  assert.equal(november.end, "2026-11-02T18:00:00.000Z");
});

test("the weekly adapter refuses to run when the published wording changes", () => {
  assert.throws(
    () => parseWeeklySchedule(fixture("salemstate-changed.html"), rockett, options),
    /wording changed/i,
    "a stale semester schedule must fail loudly rather than carry forward"
  );
});

test("the weekly adapter stops at endsOn", () => {
  const events = parseWeeklySchedule(fixture("salemstate.html"), rockett, {
    from: new Date("2026-12-01T00:00:00Z"),
    days: 60
  });
  assert.deepEqual(summarize(events), ["2026-12-07 12:00 stick-puck Stick and Puck Time"]);
});
