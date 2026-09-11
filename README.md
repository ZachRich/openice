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

## Running it on a Mac

```sh
./scripts/install-macos.sh                  # refresh once a day at 06:00
./scripts/install-macos.sh --hour 5         # ...at 05:00 instead
./scripts/install-macos.sh --with-server    # also keep the site and feed running
./scripts/install-macos.sh --uninstall
```

This installs launchd agents rather than a cron entry for one reason that matters: **if the Mac
is asleep at the scheduled time, launchd runs the job when it next wakes.** cron would skip the
day and you would only find out when the schedule looked stale.

launchd starts jobs with a bare environment — no shell profile, no nvm, no Homebrew on `PATH` —
so the installer resolves the absolute path to `node` and writes it into the agent. Logs go to
`~/Library/Logs/openice/`.

| | |
| --- | --- |
| Run the refresh now | `launchctl kickstart -k gui/$(id -u)/us.openice.refresh` |
| See whether it is loaded | `launchctl print gui/$(id -u)/us.openice.refresh \| head -20` |
| Watch it work | `tail -f ~/Library/Logs/openice/us.openice.refresh.log` |

`--with-server` adds a second agent that keeps the site up and restarts it if it dies. Without it,
the daily job refreshes the data and you run `npm start` when you want to look.

### Getting the calendar onto your phone

Every refresh writes the calendar to disk as well as serving it, so a subscription does not need a
running server. Point it at a folder that syncs, and filter it to the ice you actually want:

```sh
./scripts/install-macos.sh \
  --feed-path ~/Library/Mobile\ Documents/com~apple~CloudDocs/openice.ics \
  --feed-query 'zip=01960&radius=25&type=stick-puck&after=18'
```

`FEED_QUERY` takes exactly the same parameters as `/search`, so whatever search you like on the
site is the search your calendar gets. Default is everything within 25 miles of `HOME_ZIP`.

From there, three ways to subscribe, in increasing order of effort:

1. **A file-sharing link.** Put the feed in a synced folder and create a public link to it. The
   link has to return the **file itself**, not a preview page — `curl -sI '<link>'` should show
   `text/calendar` or at least not `text/html`. Dropbox links need `?raw=1`; some services only
   ever serve a download page, which calendar clients cannot read.
2. **Over your home network.** Install with `--with-server`, start it with `HOST=0.0.0.0`, and
   subscribe your phone to `http://<your-mac>.local:3030/calendar.ics?...`. Use the `.local` name
   rather than the IP, which changes. Updates only when you are home and the Mac is awake, and the
   subscription must be stored **on the device** — iCloud and Google fetch from their own servers,
   which cannot see your LAN.
3. **A public URL**, via a Cloudflare Tunnel or by pushing the file to any static host on each
   refresh. Needed if you want it to update while you are away, or want to use Google Calendar,
   whose servers do the fetching.

**What a daily cadence costs:** the schedule can be up to 24 hours behind. Rinks cancel walk-on ice
the same day, so a 6am refresh will catch a cancellation made overnight but not one made at noon
for a 7pm session. Every session still links back to the rink's page, and anything the collector
could not re-check is marked with the date it was last confirmed.

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

## Subscribe in your calendar

`GET /calendar.ics` takes the same query string as `/search` and returns those sessions as an
iCalendar feed, so available ice sits in your calendar beside everything else you have on:

```
/calendar.ics?zip=01960&radius=25&type=stick-puck&after=18
```

The search page carries a **Subscribe** button that builds this URL from whatever you have
filtered, so the feed is whatever search you were looking at.

Three things worth knowing about it:

- Sessions are published as **free, not busy**. They are ice that exists, not ice you committed
  to, and marking them busy would make you look unavailable.
- Each session keeps a **stable UID**, so a client updates an event in place rather than
  accumulating duplicates every time it refreshes.
- **Removal is by omission.** A subscribed feed replaces its whole collection, so a session the
  rink cancels simply stops being published and disappears from your calendar.

The feed advertises a six-hour refresh interval, matching the collector.

## Session types

A session is indexed only when the rink's own title says what it is:

| Type | Matches titles like |
| --- | --- |
| `stick-puck` | Stick & Puck, Stick Time, Stick Practice |
| `pickup` | Pickup Hockey, Open Hockey, Drop-in Hockey |
| `public-skate` | Public Skate, Open Skate, Family Skate, Adult Skate |

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
| Talbot Rink | Gloucester | Google Calendar iCalendar |

Essex Sports Center and Burbank Ice Arena are recorded but disabled: their public pages do not
offer a confirmed, stable machine-readable schedule. This avoids treating guessed data as live.

## When a rink goes quiet

A source that keeps loading but suddenly returns far fewer sessions than usual is flagged: the
refresh prints a warning and source health reads "Fewer sessions than usual". That is the failure
that is otherwise invisible — a page that still loads while the adapter has stopped matching looks
exactly like a rink with nothing posted. It is a prompt to check the rink's page, not proof of a
bug; rinks really do cancel a lot of ice.

## When a rink's page is down

A source that fails to fetch keeps the schedule it last published rather than disappearing, and
every held-over session is marked with the date it was last confirmed. After 48 hours without a
successful check the sessions are dropped — an unconfirmed schedule is worth showing for a day,
not for a week. Source health on `/rinks` and `/about` says which rinks are in that state.

## Limits to keep in mind

Rinks frequently cancel walk-on ice for rentals and events, often without updating the public
page. Every session links back to its source so you can verify before driving over. Do not reuse
a rink's private booking API or authenticated account credentials in this tool.
