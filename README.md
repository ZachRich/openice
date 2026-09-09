# OpenIce

A small, dependency-free site that consolidates publicly posted **stick & puck**, **pickup
hockey**, and **public skate** sessions at rinks around Peabody, MA (01960), and lets you search
them by ZIP code and radius. Headed for **openice.us**; currently runs locally.

## Run it

Requires Node 20 or later.

```sh
cd ~/Dev/Web-Projects/northshore-ice-finder   # the folder name; the site is OpenIce
npm start
```

Then open `http://localhost:3030`. The server refreshes data immediately at startup and every six
hours. Change the interval with `REFRESH_MINUTES=120 npm start` (minimum: 10 minutes). To refresh
just once without starting the server, use `npm run refresh`.

Useful environment variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3030` | Port to listen on |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` to reach it from your phone on the same network |
| `REFRESH_MINUTES` | `360` | How often to re-read every source |
| `HOME_ZIP` | `01960` | The ZIP the site defaults to |

## Look

The interface is built on one idea taken from the sheet itself: a red centre line opens each day,
blue lines divide the sessions, and distance is set like a jersey number. Flat surfaces, heavy
weight contrast, no rounded corners and no drop shadows anywhere. `public/styles.css` is the whole
system — the rules are documented at the top of the file, and `CLAUDE_HANDOFF.md` lists the ones
worth not breaking.

Type is Archivo from Google Fonts, the one external request the site makes. It falls back to
Helvetica/Arial with the same weights, so the design survives with no network — which is the
normal case when this runs on a home machine.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Session types, ZIP search, what's covered, FAQ |
| `/search` | Results: ZIP + radius, session type, rink, weekday, and date range filters |
| `/rinks` | Every rink, including ones deliberately not indexed, with source health |
| `/rinks/<id>` | One rink: address, directions, health, everything upcoming there |
| `/about` | The rules the collector follows, source health table, manual refresh |

The pages are rendered on the server and every filter is a plain GET form, so search results are
linkable and the site works with JavaScript switched off. `public/app.js` only saves you a click.

`GET /api/events`, `GET /api/sources`, and `POST /api/refresh` remain available for scripting.

## Session types

A session is indexed only when the rink's own title says what it is:

| Type | Matches titles like |
| --- | --- |
| `stick-puck` | Stick & Puck, Stick Time, Stick Practice |
| `pickup` | Pickup Hockey, Open Hockey, Drop-in Hockey |
| `public-skate` | Public Skate, Open Skate, Family Skate |

Lessons, clinics, leagues, games, freestyle and figure-skating ice are excluded — they are not
sessions you can turn up to.

## ZIP search

The first search for a ZIP asks a public geocoder for its coordinates and caches the answer in
`data/zipcodes.json`, so each ZIP costs one request ever. 01960 ships in that cache, so the site
works before it has ever had network access. Distance is straight-line from the ZIP's centre,
not drive time.

## Tests

```sh
npm test
```

43 tests, offline, no dependencies. They cover each adapter, Eastern-time conversion across the
daylight-saving change, session classification, every search filter, and ZIP lookup.

The committed fixtures are hand-built to match the structures these sites publish. To check a
parser against the real thing, snapshot a live page from a machine with internet access:

```sh
npm run capture -- peabody-mcvann-okeefe
npm run capture -- all
```

Captured files land in `test/fixtures/live-<source-id>.<ext>`.

## Add rinks safely

Edit `data/sources.json`. An iCalendar (`.ics`) feed is the most reliable source type:

```json
{
  "id": "example-rink",
  "name": "Example Rink",
  "town": "Town",
  "address": "Street, Town, MA ZIP",
  "latitude": 42.5,
  "longitude": -71.0,
  "adapter": "ical",
  "feedUrl": "https://example.org/public.ics",
  "sourceUrl": "https://example.org/schedule",
  "price": "$20.00",
  "enabled": true
}
```

`price` is optional and shown as-is; leave it out and the card says "No price listed".

For public pages without iCalendar, use a deliberate adapter rather than treating a page as a
feed. This build includes `myrec` for municipal MyRec event lists and `weekly` for a published,
date-bounded weekly schedule. The weekly adapter checks for an identifying phrase on every
refresh and stops rather than silently carrying a stale semester schedule forward.

## Currently indexed

| Rink | Town | Adapter |
| --- | --- | --- |
| McVann–O'Keefe Memorial Rink | Peabody | Google Calendar iCalendar |
| Stoneham Arena | Stoneham | CivicPlus iCalendar |
| Ed Burns Arena | Arlington | MyRec public calendar |
| LoConte Ice Rink | Medford | MyRec public calendar |
| Rockett Arena, Salem State | Salem | Verified weekly schedule |

Essex Sports Center and Burbank Ice Arena are recorded but disabled: their public pages do not
offer a confirmed, stable machine-readable schedule. This avoids treating guessed data as live.

## When a rink's page is down

A source that fails to fetch keeps the schedule it last published rather than disappearing, and
every held-over session is marked with the date it was last confirmed. After 48 hours without a
successful check the sessions are dropped — an unconfirmed schedule is worth showing for a day,
not for a week. Source health on `/rinks` and `/about` says which rinks are in that state.

## Limits to keep in mind

Rinks frequently cancel walk-on ice for rentals and events, often without updating the public
page. Every session links back to its source so you can verify before driving over. Do not reuse
a rink's private booking API or authenticated account credentials in this tool.
