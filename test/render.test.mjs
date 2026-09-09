import test from "node:test";
import assert from "node:assert/strict";
import { eventCard, dayGroups, searchForm, escapeHtml, layout } from "../src/render.mjs";
import { easternToUtc } from "../src/ical.mjs";

function session(overrides = {}) {
  return {
    id: "x", rinkId: "peabody", rink: "McVann–O'Keefe Memorial Rink", town: "Peabody",
    address: "511 Lowell St, Peabody, MA 01960",
    type: "stick-puck", title: "STICK TIME",
    start: easternToUtc(2026, 10, 8, 20, 15, 0).toISOString(),
    end: easternToUtc(2026, 10, 8, 21, 45, 0).toISOString(),
    sourceUrl: "https://example.org/schedule",
    distanceMiles: 1,
    ...overrides
  };
}

test("escapeHtml neutralises every character that could break out of markup", () => {
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
  assert.equal(escapeHtml(null), "");
});

test("a rink name with an apostrophe survives into the card safely", () => {
  const html = eventCard(session());
  assert.match(html, /McVann–O&#39;Keefe Memorial Rink/);
  assert.ok(!html.includes("O'Keefe"), "the raw apostrophe must not reach the attribute-bearing markup");
});

test("a hostile source title cannot inject markup", () => {
  const html = eventCard(session({ title: '<img src=x onerror="alert(1)">' }));
  assert.ok(!html.includes("<img"), "the tag must be escaped");
  assert.match(html, /&lt;img src=x onerror=/);
});

test("the card shows the time range, the type, and the distance", () => {
  const html = eventCard(session());
  assert.match(html, /8:15 – 9:45 PM/);
  assert.match(html, /class="event-type stick-puck"/);
  assert.match(html, /<b>1<\/b>miles/);
  assert.match(html, /href="\/rinks\/peabody"/);
});

test("a session posted under a different name says so", () => {
  assert.match(eventCard(session()), /Posted as &ldquo;STICK TIME&rdquo;/);
  assert.ok(!eventCard(session({ title: "Stick & Puck" })).includes("Posted as"),
    "no need to repeat the title when it already matches the type");
});

test("price falls back to a plain statement rather than a guess", () => {
  assert.match(eventCard(session()), /No price listed/);
  assert.match(eventCard(session({ price: "$20.00" })), /class="price">\$20\.00</);
});

test("each day opens with a heading and the centre line", () => {
  const html = dayGroups([{ date: "2026-10-08", label: "Thursday, October 8", events: [session()] }]);
  assert.match(html, /<h2 class="day-heading">Thursday, October 8<\/h2>/);
  assert.match(html, /<i class="centre-line" aria-hidden="true"><\/i>/);
});

test("the search form round-trips the current query into its controls", () => {
  const html = searchForm({
    query: { zip: "01960", radius: 25, types: ["pickup"], rink: "stoneham-arena", weekday: 4, start: "2026-10-01", end: "" },
    rinks: [{ id: "stoneham-arena", name: "Stoneham Arena", town: "Stoneham" }]
  });
  assert.match(html, /value="01960"/);
  assert.match(html, /<option value="25" selected>25 miles<\/option>/);
  assert.match(html, /value="pickup" checked/);
  assert.ok(!/value="stick-puck" checked/.test(html), "an unselected type must not be checked");
  assert.match(html, /<option value="stoneham-arena" selected>/);
  assert.match(html, /<option value="4" selected>Thursday<\/option>/);
  assert.match(html, /name="start" value="2026-10-01"/);
});

test("every page is a complete document with a skip link and one main landmark", () => {
  const html = layout({ title: "Test", body: "<p>hi</p>", active: "search" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<a class="skip" href="#main">/);
  assert.equal(html.match(/<main id="main">/g).length, 1);
  assert.match(html, /<a href="\/search" aria-current="page">Find ice<\/a>/);
});
