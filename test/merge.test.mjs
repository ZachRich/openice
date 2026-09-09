import test from "node:test";
import assert from "node:assert/strict";
import { mergeCollection, STALE_LIMIT_HOURS } from "../src/merge.mjs";

const now = new Date("2026-09-10T12:00:00Z");
const hoursAgo = hours => new Date(now.getTime() - hours * 3_600_000).toISOString();

const SOURCES = [
  { id: "peabody", name: "Peabody", enabled: true },
  { id: "stoneham", name: "Stoneham", enabled: true },
  { id: "burbank", name: "Burbank", enabled: false }
];

const session = (rinkId, hour) => ({
  id: `${rinkId}-${hour}`, rinkId, rink: rinkId, type: "stick-puck",
  start: `2026-09-1${hour}T16:00:00.000Z`, end: `2026-09-1${hour}T17:00:00.000Z`
});

const prior = {
  events: [session("peabody", 2), session("peabody", 3), session("stoneham", 4)],
  sourceStatus: {
    peabody: { state: "ok", checkedAt: hoursAgo(6), lastSuccessAt: hoursAgo(6), count: 2 },
    stoneham: { state: "ok", checkedAt: hoursAgo(6), lastSuccessAt: hoursAgo(6), count: 1 }
  }
};

const ok = (id, events) => ({ id, state: "ok", events, message: "Read 100 bytes" });
const failed = id => ({ id, state: "error", message: "fetch failed" });
const off = id => ({ id, state: "disabled", message: "no public feed" });

test("a successful source replaces what it had before", () => {
  const result = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [ok("peabody", [session("peabody", 5)]), ok("stoneham", [session("stoneham", 4)]), off("burbank")]
  });
  assert.equal(result.events.filter(event => event.rinkId === "peabody").length, 1);
  assert.equal(result.sourceStatus.peabody.count, 1);
  assert.equal(result.sourceStatus.peabody.lastSuccessAt, now.toISOString());
});

test("a failed source keeps the schedule it last published", () => {
  const result = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [failed("peabody"), ok("stoneham", [session("stoneham", 4)]), off("burbank")]
  });
  const held = result.events.filter(event => event.rinkId === "peabody");
  assert.equal(held.length, 2, "the rink does not vanish because of one timeout");
  assert.equal(result.sourceStatus.peabody.state, "error");
  assert.equal(result.sourceStatus.peabody.retained, true);
});

test("held-over sessions say when they were last confirmed", () => {
  const result = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [failed("peabody"), ok("stoneham", []), off("burbank")]
  });
  for (const event of result.events.filter(event => event.rinkId === "peabody")) {
    assert.equal(event.staleSince, hoursAgo(6));
  }
});

test("a success clears the stale marking", () => {
  const stale = {
    events: [{ ...session("peabody", 2), staleSince: hoursAgo(30) }],
    sourceStatus: { peabody: { state: "error", checkedAt: hoursAgo(1), lastSuccessAt: hoursAgo(30) } }
  };
  const result = mergeCollection({
    sources: SOURCES, prior: stale, now,
    outcomes: [ok("peabody", [session("peabody", 5)]), ok("stoneham", []), off("burbank")]
  });
  assert.ok(result.events.every(event => event.staleSince === undefined));
});

test("an unconfirmed schedule is dropped once it is too old to stand behind", () => {
  const old = {
    events: [session("peabody", 2)],
    sourceStatus: { peabody: { state: "error", checkedAt: hoursAgo(1), lastSuccessAt: hoursAgo(STALE_LIMIT_HOURS + 1) } }
  };
  const result = mergeCollection({
    sources: SOURCES, prior: old, now,
    outcomes: [failed("peabody"), ok("stoneham", []), off("burbank")]
  });
  assert.equal(result.events.length, 0);
  assert.equal(result.sourceStatus.peabody.retained, false);
  assert.equal(result.sourceStatus.peabody.dropped, true, "the page should be able to say the sessions went away");
});

test("the last success time survives repeated failures", () => {
  const first = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [failed("peabody"), ok("stoneham", []), off("burbank")]
  });
  const later = new Date(now.getTime() + 6 * 3_600_000);
  const second = mergeCollection({
    sources: SOURCES, prior: first, now: later,
    outcomes: [failed("peabody"), ok("stoneham", []), off("burbank")]
  });
  assert.equal(second.sourceStatus.peabody.lastSuccessAt, hoursAgo(6), "not reset to the last attempt");
  assert.equal(second.sourceStatus.peabody.retained, true);
});

test("a disabled source contributes nothing and is never retained", () => {
  const withBurbank = { ...prior, events: [...prior.events, session("burbank", 5)] };
  const result = mergeCollection({
    sources: SOURCES, prior: withBurbank, now,
    outcomes: [ok("peabody", []), ok("stoneham", []), off("burbank")]
  });
  assert.equal(result.events.length, 0);
  assert.equal(result.sourceStatus.burbank.state, "disabled");
});

test("a source with no outcome at all is treated as failed, not as empty", () => {
  const result = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [ok("stoneham", [session("stoneham", 4)]), off("burbank")]
  });
  assert.equal(result.sourceStatus.peabody.state, "error");
  assert.equal(result.events.filter(event => event.rinkId === "peabody").length, 2);
});

test("a source dropped from sources.json stops being reported", () => {
  const result = mergeCollection({
    sources: SOURCES.filter(source => source.id !== "stoneham"), prior, now,
    outcomes: [ok("peabody", []), off("burbank")]
  });
  assert.ok(!("stoneham" in result.sourceStatus));
  assert.equal(result.events.length, 0);
});

test("events come back in start order regardless of which source supplied them", () => {
  const result = mergeCollection({
    sources: SOURCES, prior, now,
    outcomes: [ok("peabody", [session("peabody", 5)]), ok("stoneham", [session("stoneham", 3)]), off("burbank")]
  });
  assert.deepEqual(result.events.map(event => event.rinkId), ["stoneham", "peabody"]);
});

/* ------------------------------------------------ a source that goes quiet */

import { volumeDrop, VOLUME_HISTORY } from "../src/merge.mjs";

const history = counts => ({
  events: [],
  sourceStatus: { peabody: { state: "ok", checkedAt: hoursAgo(6), lastSuccessAt: hoursAgo(6), recentCounts: counts } }
});

test("no judgement is made until there is enough history", () => {
  assert.equal(volumeDrop([], 0), null);
  assert.equal(volumeDrop([50, 50], 0), null, "two samples is not a baseline");
  assert.notEqual(volumeDrop([50, 50, 50], 0), null);
});

test("a sharp fall against the usual level is flagged", () => {
  assert.deepEqual(volumeDrop([52, 51, 50, 52], 24), { baseline: 52, count: 24 });
  assert.equal(volumeDrop([52, 51, 50, 52], 30), null, "a mild dip is not a signal");
});

test("one strange run does not move the baseline", () => {
  // The median ignores the outlier, so the following normal run is not flagged.
  assert.equal(volumeDrop([50, 50, 0, 50, 50], 48), null);
});

test("a source that goes to zero while fetching fine is flagged", () => {
  // The exact failure the data-quality rules cannot see: "ok, 0 sessions" from a rink
  // that always has sessions looks identical to a rink with nothing posted.
  assert.deepEqual(volumeDrop([12, 14, 13], 0), { baseline: 13, count: 0 });
});

test("a rink that only ever posts a session or two is left alone", () => {
  assert.equal(volumeDrop([2, 1, 2], 0), null, "small numbers swing for ordinary reasons");
});

test("the signal appears in source health and clears once the new level is normal", () => {
  const dropped = mergeCollection({
    sources: SOURCES, prior: history([52, 51, 50, 52]), now,
    outcomes: [ok("peabody", Array.from({ length: 24 }, (unused, i) => session("peabody", 2))), ok("stoneham", []), off("burbank")]
  });
  assert.deepEqual(dropped.sourceStatus.peabody.volumeDrop, { baseline: 52, count: 24 });

  // Once 24 has been seen enough times it is simply what this rink publishes now.
  const settled = mergeCollection({
    sources: SOURCES, prior: history([24, 24, 24, 24, 24]), now,
    outcomes: [ok("peabody", Array.from({ length: 24 }, (unused, i) => session("peabody", 2))), ok("stoneham", []), off("burbank")]
  });
  assert.equal(settled.sourceStatus.peabody.volumeDrop, undefined);
});

test("history is kept to a fixed length and only records successful checks", () => {
  const long = Array.from({ length: VOLUME_HISTORY + 5 }, () => 10);
  const result = mergeCollection({
    sources: SOURCES, prior: history(long), now,
    outcomes: [ok("peabody", [session("peabody", 2)]), ok("stoneham", []), off("burbank")]
  });
  assert.equal(result.sourceStatus.peabody.recentCounts.length, VOLUME_HISTORY);
  assert.equal(result.sourceStatus.peabody.recentCounts.at(-1), 1);
});

test("a failed check does not enter the history or erase it", () => {
  const result = mergeCollection({
    sources: SOURCES, prior: history([20, 20, 20]), now,
    outcomes: [failed("peabody"), ok("stoneham", []), off("burbank")]
  });
  assert.deepEqual(result.sourceStatus.peabody.recentCounts, [20, 20, 20], "a timeout says nothing about volume");
  assert.equal(result.sourceStatus.peabody.volumeDrop, undefined);
});
