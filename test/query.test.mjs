import test from "node:test";
import assert from "node:assert/strict";
import { easternToUtc } from "../src/ical.mjs";
import { searchEvents, rinkOptions, easternWeekday, TYPE_IDS } from "../src/query.mjs";

const now = new Date("2026-10-01T09:00:00Z");
const PEABODY = { latitude: 42.5426, longitude: -70.9368 };

function event(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    rinkId: "peabody", rink: "McVann-O'Keefe", town: "Peabody",
    address: "511 Lowell St", latitude: 42.5434, longitude: -70.9559,
    type: "stick-puck", title: "Stick Time",
    start: easternToUtc(2026, 10, 5, 12, 0, 0).toISOString(),
    end: easternToUtc(2026, 10, 5, 13, 0, 0).toISOString(),
    sourceUrl: "https://example.org",
    ...overrides
  };
}

const FAR = { rinkId: "far", rink: "Far Rink", town: "Springfield", latitude: 42.1, longitude: -72.6 };

test("only the requested session types come back", () => {
  const events = [event({}), event({ type: "pickup" }), event({ type: "public-skate" })];
  assert.equal(searchEvents(events, { now, types: ["pickup"] }).total, 1);
  assert.equal(searchEvents(events, { now, types: ["pickup", "public-skate"] }).total, 2);
  assert.equal(searchEvents(events, { now, types: TYPE_IDS }).total, 3);
});

test("sessions in the past are dropped", () => {
  const events = [
    event({ start: easternToUtc(2026, 9, 30, 12, 0, 0).toISOString() }),
    event({ start: easternToUtc(2026, 10, 5, 12, 0, 0).toISOString() })
  ];
  assert.equal(searchEvents(events, { now }).total, 1);
});

test("distance is measured from the searched location", () => {
  const events = [event({}), event({ ...FAR })];
  const result = searchEvents(events, { now, origin: PEABODY });
  const [near, far] = result.events;
  assert.ok(near.distanceMiles < 2, `expected the Peabody rink to be close, got ${near.distanceMiles}`);
  assert.ok(far.distanceMiles > 80, `expected Springfield to be far, got ${far.distanceMiles}`);
});

test("with no location, distance is unknown rather than wrong", () => {
  const result = searchEvents([event({})], { now });
  assert.equal(result.events[0].distanceMiles, null);
});

test("the radius excludes rinks and reports which ones", () => {
  const events = [event({}), event({ ...FAR })];
  const result = searchEvents(events, { now, origin: PEABODY, radiusMiles: 25 });
  assert.equal(result.total, 1);
  assert.deepEqual(result.rinksOutOfRange, ["far"]);
});

test("filtering by rink keeps only that rink", () => {
  const result = searchEvents([event({}), event({ ...FAR })], { now, rinkId: "far" });
  assert.equal(result.total, 1);
  assert.equal(result.events[0].rinkId, "far");
});

test("the weekday filter uses the Eastern weekday", () => {
  // 8:15 PM Thursday Eastern is Friday in UTC; the filter must still call it Thursday.
  const thursdayNight = event({ start: easternToUtc(2026, 10, 8, 20, 15, 0).toISOString() });
  assert.equal(easternWeekday(thursdayNight.start), 4);
  assert.equal(searchEvents([thursdayNight], { now, weekday: 4 }).total, 1);
  assert.equal(searchEvents([thursdayNight], { now, weekday: 5 }).total, 0);
});

test("the date range is inclusive at both ends, in Eastern days", () => {
  const events = [
    event({ start: easternToUtc(2026, 10, 5, 12, 0, 0).toISOString() }),
    event({ start: easternToUtc(2026, 10, 9, 23, 30, 0).toISOString() }),
    event({ start: easternToUtc(2026, 10, 10, 12, 0, 0).toISOString() })
  ];
  const result = searchEvents(events, { now, startDate: "2026-10-05", endDate: "2026-10-09" });
  assert.equal(result.total, 2, "the 11:30 PM session on the last day still counts");
});

test("results are grouped into Eastern calendar days, in order", () => {
  const events = [
    event({ start: easternToUtc(2026, 10, 6, 12, 0, 0).toISOString() }),
    event({ start: easternToUtc(2026, 10, 5, 20, 0, 0).toISOString() }),
    event({ start: easternToUtc(2026, 10, 5, 12, 0, 0).toISOString() })
  ];
  const result = searchEvents(events, { now });
  assert.deepEqual(result.days.map(day => day.date), ["2026-10-05", "2026-10-06"]);
  assert.deepEqual(result.days.map(day => day.events.length), [2, 1]);
  assert.equal(result.days[0].label, "Monday, October 5");
});

test("the rink filter lists only rinks that actually have sessions", () => {
  const sources = [
    { id: "peabody", name: "McVann-O'Keefe", town: "Peabody" },
    { id: "quiet", name: "Quiet Rink", town: "Nowhere" }
  ];
  assert.deepEqual(rinkOptions([event({})], sources), [{ id: "peabody", name: "McVann-O'Keefe", town: "Peabody" }]);
});
