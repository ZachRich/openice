# North Shore Ice Finder — Claude Handoff

## Goal

Maintain a small local dashboard for stick & puck / stick time near ZIP 01960 (Peabody, MA), prioritizing sources within roughly a 45-minute drive. It should refresh public schedules continuously and never invent sessions from a stale or unverified page.

## Run locally

```sh
cd northshore-ice-finder
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
- `server.mjs` — local HTTP server and refresh loop.
- `public/` — dashboard interface.

## Current live sources (verified Sep. 9, 2026)

| Rink | Town | Adapter | Result during last full refresh |
| --- | --- | --- | --- |
| McVann–O'Keefe Memorial Rink | Peabody | `ical` (public Google Calendar) | 52 sessions |
| Stoneham Arena | Stoneham | `ical` (official CivicPlus calendar) | 15 sessions |
| Ed Burns Arena | Arlington | `myrec` | 16 sessions |
| Rockett Arena / Salem State | Salem | `weekly` | 3 sessions inside the next 60 days; schedule ends Dec. 7, 2026 |
| LoConte Ice Rink | Medford | `myrec` | Source healthy, no future stick sessions posted |

Disabled placeholders: Essex Sports Center (DaySmart) and Burbank Ice Arena. Do not enable either until a public, stable source is confirmed.

## Data-quality rules

1. Use only publicly reachable schedule pages or public iCalendar feeds; never use logged-in booking endpoints.
2. Include events only if the title clearly signals Stick & Puck, Stick Time, Stick Practice, Open Hockey, or Pickup Hockey.
3. Preserve the official source/registration URL on each event so users can confirm before driving.
4. For a static semester schedule, use `weekly` with `startsOn`, `endsOn`, and `requiredText`. Update or disable it once the published term changes.
5. A successfully fetched page with zero matching sessions is valid and should stay visible as healthy rather than guessed.

## Good next work

1. Research a public, reliable schedule source for Hockeytown Saugus or Essex Sports Center. Add an adapter only after verifying live, future Stick & Puck rows.
2. Build a generic adapter for additional public calendar platforms only when their HTML structure is stable and testable.
3. Improve the dashboard’s source-health labels to use rink names instead of source IDs.
4. Add a small test fixture per adapter before supporting more site layouts.

## Verification

After changes, run:

```sh
npm run refresh
```

Confirm all enabled sources are `ok` in `data/events.json`, inspect a few generated start times in Eastern Time, then reload the local dashboard.
