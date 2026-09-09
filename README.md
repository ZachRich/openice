# North Shore Ice Finder

A small, dependency-free dashboard that consolidates publicly posted stick & puck, stick time, and pickup-hockey schedules around Peabody, MA (01960).

## Run it

Requires Node 20 or later.

```sh
cd ~/Dev/Web-Projects/northshore-ice-finder
npm start
```

Then open `http://localhost:3030`. The server refreshes data immediately at startup and every six hours. Change the interval with `REFRESH_MINUTES=120 npm start` (minimum: 10 minutes). To refresh just once, use `npm run refresh`.

## Tests

```sh
npm test
```

The suite runs offline against saved fixtures in `test/fixtures/` — no network, no
dependencies. It covers each adapter, Eastern-time conversion across the daylight-saving
change, and the recurrence rules that decide whether a session is real.

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
  "enabled": true
}
```

The collector only saves calendar events whose titles look like `Stick & Puck`, `Stick Time`, `Stick Practice`, `Open Hockey`, or `Pickup Hockey`. Pickup stays hidden in the dashboard unless the user enables it.

For public pages without iCalendar, use a deliberate adapter instead of treating a page as a feed. This build includes `myrec` for municipal MyRec event lists and `weekly` for a published, date-bounded weekly schedule. The weekly adapter checks for an identifying phrase on every refresh and stops rather than silently carrying a stale semester schedule forward.

## Verified public feeds near 01960

The dashboard currently indexes these continuously updating, official public feeds:

| Rink | Feed | Current program matched |
| --- | --- | --- |
| McVann–O'Keefe Memorial Rink, Peabody | Google Calendar iCalendar | Stick Time |
| Stoneham Arena, Stoneham | CivicPlus iCalendar | Adult Stick Practice |

The Essex and Burbank records are intentionally disabled: their current public pages do not offer a confirmed, stable machine-readable calendar feed. This avoids treating stale or guessed schedule data as live. Other nearby rinks that publish a web-only schedule can be added with a separate source adapter, rather than pretending their pages are iCalendar feeds.

## Verified web-schedule adapters

| Rink | Adapter | What it indexes |
| --- | --- | --- |
| Ed Burns Arena, Arlington | MyRec public calendar | Men's, women's, family, and youth Stick & Puck listings |
| LoConte Ice Rink, Medford | MyRec public calendar | Future Stick & Puck listings when the rink posts them |
| Rockett Arena, Salem State | Verified weekly schedule | Fall 2026 Monday Stick and Puck, through December 7 |

## Keeping it running

Leave `npm start` running on a machine that has internet access. For an always-on personal setup, run it on a small home server, NAS, or a hosted Node service. The dashboard’s **Refresh schedules** button triggers the same collection immediately.

## Limits to keep in mind

Rinks frequently cancel walk-on ice for rentals or events. The dashboard retains a source-health message and links every event back to its rink page, so you can verify before driving over. Do not reuse a rink's private booking API or authenticated account credentials in this tool.
