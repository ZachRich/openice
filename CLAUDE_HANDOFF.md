# OpenIce — Claude Handoff

## Goal

Maintain OpenIce (openice.us): a small site that finds walk-on ice — stick & puck, pickup hockey,
and public skate — searchable by ZIP and radius. Coverage today is the rinks within reach of
01960; the interface is not written around that one area, so keep new copy geography-neutral. It should refresh public
schedules continuously and never invent sessions from a stale or unverified page.

## Run locally

```sh
cd northshore-ice-finder   # folder name only; the site is OpenIce
npm start
```

Open `http://127.0.0.1:3030`. It refreshes at startup and every six hours. Run `npm run refresh` for a one-time collection.

No package installation is required; this is Node ESM using built-in APIs.

## Key files

- `data/sources.json` — rink records, source URLs, and adapter configuration.
- `src/collectors.mjs` — fetches every enabled source and invokes its adapter.
- `src/ical.mjs` — public iCalendar parsing and recurrence expansion.
- `src/web.mjs` — public-page adapters:
  - `myrec`: parses date headers and Stick & Puck rows from municipal MyRec calendars.
  - `weekly`: creates date-bounded recurring sessions from a published schedule, and verifies a required phrase remains on the source page every refresh.
- `src/query.mjs` — every search filter (type, rink, weekday, date range, radius), day grouping,
  and query-time distance. Session types and weekday lists live here.
- `src/geocode.mjs` — ZIP -> coordinates, cached in `data/zipcodes.json`; 01960 is pre-seeded.
- `src/render.mjs` / `src/pages.mjs` / `src/icons.mjs` — server-rendered HTML. Pages are plain
  strings; every filter is a GET form, so the site works without JavaScript.
- `src/ics.mjs` — publishes the search results as a subscribable iCalendar feed. RFC 5545 is
  fussy: text escaping, 75-**octet** line folding that must not split a multi-byte character, and
  CRLF endings. There is a round-trip test that reads our own feed back with `parseIcalSchedule` —
  if the collector cannot read what we publish, it is malformed.
- `server.mjs` — HTTP server, routes, and refresh loop.
- `public/` — stylesheet and a small progressive-enhancement script.
- `test/` — offline fixture-based tests (`npm test`); `scripts/capture.mjs` snapshots a live
  source into `test/fixtures/` from a networked machine.

## Current live sources (verified Sep. 9, 2026)

| Rink | Town | Adapter | Result during last full refresh |
| --- | --- | --- | --- |
| McVann–O'Keefe Memorial Rink | Peabody | `ical` (public Google Calendar) | 52 sessions |
| Stoneham Arena | Stoneham | `ical` (official CivicPlus calendar) | 15 sessions |
| Ed Burns Arena | Arlington | `myrec` | 16 sessions |
| Rockett Arena / Salem State | Salem | `weekly` | 3 sessions inside the next 60 days; schedule ends Dec. 7, 2026 |
| LoConte Ice Rink | Medford | `myrec` | Source healthy, no future stick sessions posted |

Disabled placeholders: Essex Sports Center (DaySmart) and Burbank Ice Arena. Do not enable either until a public, stable source is confirmed.

## Recurrence handling

`src/ical.mjs` expands `RRULE` in **Eastern calendar days**, not UTC days. Two things depend on
this: a weekly series must keep its wall-clock time when daylight saving ends, and `BYDAY` must
match the local weekday (8:15 PM Thursday Eastern is already Friday in UTC). Occurrences are then
removed if they are listed in `EXDATE`, or if another `VEVENT` claims that instance through
`RECURRENCE-ID` — cancelled or rescheduled. Anything that changes this function needs a fixture
proving the excluded instance stays excluded.

Not supported yet: `RECURRENCE-ID;RANGE=THISANDFUTURE`, `RDATE`, and `FREQ` values other than
`WEEKLY` and `DAILY` (those fall back to the single `DTSTART`).

## How it is deployed

There is no server anywhere. `.github/workflows/feed.yml` runs the collector on every push to
`main` and once a day, and publishes `openice.ics` to GitHub Pages. The website still exists and
still works, but it is a local tool now: `npm start` when you want to search.

Two properties of that workflow are load-bearing and should not be removed casually:

1. It restores `data/events.json` from the Actions cache. Without it, every run is a cold start —
   no stale retention, and the volume detector never has history to compare against.
2. It fails rather than publishing a calendar with zero sessions. An empty feed does not look
   broken to a calendar client; it looks like every session was cancelled, and it empties the
   subscription silently.

## Visual identity — "Lines"

Chosen deliberately over two alternatives; do not drift back toward generic card UI.

- **No rounded corners, no drop shadows, no card surfaces.** Separation comes from rules, not from
  boxes floating on a tinted ground.
- **The rules mean something.** A 3px red rule opens a day (centre line); a 2px blue rule divides
  sessions and rink rows (blue line); a 3px black rule separates page regions. Gold is reserved for
  public skate and for "not indexed yet" states.
- **Weight, not size, carries hierarchy.** Archivo 900 for headings and day names, 700 for data,
  400 for prose. Headings are uppercase with tight negative tracking.
- **Figures are tabular** everywhere they line up — times, distances, prices, ZIPs.
- **Distance is set like a jersey number**: large, red, with the unit small underneath.
- Session type is a solid rectangular tag, coloured by type (blue / red / gold), never a pill.

## Session types

`classifyIceEvent` in `src/ical.mjs` is the single gate. It returns `stick-puck`, `pickup`,
`public-skate`, or null, and it rejects lessons, clinics, leagues, games and freestyle first —
several rinks title a lesson programme "Learn To Skate", which would otherwise match the skate
patterns. Widening it means adding a fixture case in `test/ical.test.mjs` at the same time.

## Stale sources

`src/merge.mjs` decides what a refresh keeps, and it is a pure function so it can be tested
without touching the network. A source that fails keeps the schedule it last returned, with every
held-over event marked `staleSince`, until that becomes older than `STALE_LIMIT_HOURS` (48) — past
that the events are dropped and the status carries `dropped: true`, so the page can say the
sessions went away rather than silently showing nothing. `lastSuccessAt` survives repeated
failures; only a success moves it.

The reasoning: a failed fetch is nearly always transient, and yesterday's schedule for a rink is
much closer to the truth than no schedule. But an unconfirmed schedule is worth showing for a day,
not for a week.

## Watching for a source going quiet

A source can fetch perfectly and stop being true: the page still loads, the markup shifts, and the
adapter matches nothing. That reads as `ok, 0 sessions`, which is indistinguishable from a rink
with nothing posted — the one case rule 5 below deliberately calls healthy.

So each source keeps its last 10 successful counts in `recentCounts`, and a refresh compares the
new count against their median. A count at or below half the median (when the median is at least
3, so a rink that posts one session a week is left alone) sets `volumeDrop`, which prints a warning
on the terminal and shows in source health as "Fewer sessions than usual". A failed check never
enters the history — a timeout says nothing about how much a rink publishes.

It is a prompt to look, not a verdict: the 52-to-24 fall at McVann-O'Keefe was real. The signal
clears itself once the new level has been seen often enough to become the median.

## Data-quality rules

1. Use only publicly reachable schedule pages or public iCalendar feeds; never use logged-in booking endpoints.
2. Include events only if the title clearly signals Stick & Puck, Stick Time, Stick Practice, Open Hockey, or Pickup Hockey.
3. Preserve the official source/registration URL on each event so users can confirm before driving.
4. For a static semester schedule, use `weekly` with `startsOn`, `endsOn`, and `requiredText`. Update or disable it once the published term changes.
5. A successfully fetched page with zero matching sessions is valid and should stay visible as healthy rather than guessed.

## Good next work

1. Improve the source-health labels to use rink names instead of source IDs.
3. Research a public, reliable schedule source for Hockeytown Saugus or Essex Sports Center. Add
   an adapter only after verifying live, future Stick & Puck rows.
4. Build a generic adapter for additional public calendar platforms only when their HTML structure
   is stable and testable.
5. Capture a live fixture per source (`npm run capture -- all`) so the suite tests real markup
   alongside the hand-built fixtures.
6. Centralize the 60-day collection window; it is duplicated across the adapter signatures.
7. The dashboard is gone; the site is server-rendered. If a page ever needs live updating, add it
   as progressive enhancement in `public/app.js` rather than moving rendering to the client.

## Verification

After changes, run:

```sh
npm test
npm run refresh
```

Confirm all enabled sources are `ok` in `data/events.json`, inspect a few generated start times in Eastern Time, then reload the local dashboard.
