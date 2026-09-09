import test from "node:test";
import assert from "node:assert/strict";
import { lookupZip, normalizeZip, ZipError } from "../src/geocode.mjs";

const PAYLOAD = {
  places: [{ "place name": "Peabody", "state abbreviation": "MA", latitude: "42.5426", longitude: "-70.9368" }]
};

const respondWith = (status, body) => async () => ({
  ok: status === 200, status, json: async () => body
});

test("normalizeZip accepts five digits and nothing else", () => {
  assert.equal(normalizeZip(" 01960 "), "01960");
  assert.equal(normalizeZip("1960"), null);
  assert.equal(normalizeZip("019601"), null);
  assert.equal(normalizeZip("0196a"), null);
  assert.equal(normalizeZip(undefined), null);
});

test("a cached ZIP never reaches the network", async () => {
  const cache = { "01960": { latitude: 42.5426, longitude: -70.9368, place: "Peabody, MA" } };
  const fetchImpl = () => { throw new Error("should not be called"); };
  const result = await lookupZip("01960", { cache, fetchImpl });
  assert.equal(result.fromCache, true);
  assert.equal(result.place, "Peabody, MA");
});

test("a fresh ZIP is looked up once and then cached", async () => {
  const cache = {};
  let calls = 0;
  const fetchImpl = async (...args) => { calls++; return respondWith(200, PAYLOAD)(...args); };

  const first = await lookupZip("01960", { cache, fetchImpl });
  assert.equal(first.fromCache, false);
  assert.equal(first.latitude, 42.5426);
  assert.equal(first.place, "Peabody, MA");

  const second = await lookupZip("01960", { cache, fetchImpl });
  assert.equal(second.fromCache, true);
  assert.equal(calls, 1, "the second lookup should be served from the cache");
});

test("a malformed ZIP is rejected before any request", async () => {
  const fetchImpl = () => { throw new Error("should not be called"); };
  await assert.rejects(() => lookupZip("abc", { fetchImpl }), ZipError);
});

test("an unknown ZIP says so plainly", async () => {
  await assert.rejects(
    () => lookupZip("00000", { cache: {}, fetchImpl: respondWith(404, {}) }),
    /No US ZIP code 00000/
  );
});

test("a network failure is reported, not thrown as a crash", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(
    () => lookupZip("01960", { cache: {}, fetchImpl }),
    error => error instanceof ZipError && /Check the connection/.test(error.message)
  );
});

test("a response without usable coordinates is refused", async () => {
  await assert.rejects(
    () => lookupZip("01960", { cache: {}, fetchImpl: respondWith(200, { places: [] }) }),
    /No usable location/
  );
});
