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
