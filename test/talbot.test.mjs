// Real blocks from the Talbot Rink public calendar, captured 11 Sep 2026. This rink publishes
// its entire booking sheet — every private rental is an event named after whoever reserved it —
// so it is the sharpest test of the classifier deciding what the public can actually turn up to.
import test from "node:test";
import assert from "node:assert/strict";
import { parseIcalSchedule, classifyIceEvent } from "../src/ical.mjs";
import { fixture, source } from "./helpers.mjs";

function collected() {
  // The fixture spans several seasons; a wide window takes all of it.
  return parseIcalSchedule(fixture("talbot-titles.ics"), source({ id: "talbot" }),
    { from: new Date("2021-01-01T00:00:00Z"), days: 3000 });
}

test("the walk-on sessions are collected, with the right type", () => {
  const byTitle = Object.fromEntries(collected().map(event => [event.title, event.type]));
  assert.equal(byTitle["STICK PRACTICE 18+"], "stick-puck");
  assert.equal(byTitle["PUBLIC SKATE"], "public-skate");
  assert.equal(byTitle["ADULT SKATE 18+"], "public-skate", "the rink's adult-only session is a public skate");
  assert.equal(byTitle["OPEN SKATE NO STICKS/PUCKS 18+"], "public-skate");
});

test("private rentals, closures and lessons are left out", () => {
  const titles = collected().map(event => event.title);
  for (const excluded of ["CAYH", "HARNISH", "GHS BOYS", "RINK CLOSED", "FIGURE SKATERS 10am-2pm", "VETS PTO SKATE"]) {
    assert.ok(!titles.includes(excluded), `${excluded} is not something the public can turn up to`);
  }
});

test("a rental named after the person who booked it never looks like a session", () => {
  // Two thirds of this rink's calendar is surnames. None of them may classify.
  for (const name of ["HARNISH", "MACFARLAND", "O'MALEY", "SUPORN", "GIACALONE", "CRYSTAL BLADES", "INDUSTRIAL LEAGUE"]) {
    assert.equal(classifyIceEvent(name), null, name);
  }
});

test("a session titled with sticks and pucks in the negative is still a skate", () => {
  // "OPEN SKATE NO STICKS/PUCKS" must not trip the stick & puck patterns.
  assert.equal(classifyIceEvent("OPEN SKATE NO STICKS/PUCKS 18+"), "public-skate");
  assert.equal(classifyIceEvent("ADULT STICK PRACTICE 18+"), "stick-puck", "but a real stick session still wins");
});

test("the last skate of a season is not a public session", () => {
  for (const title of ["GHS JV LAST SKATE", "CAFSC LAST SKATE", "G.H.S. BOYS LAST SKATE"]) {
    assert.equal(classifyIceEvent(title), null, title);
  }
});
