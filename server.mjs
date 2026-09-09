import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collect } from "./src/collectors.mjs";
import { mergeCollection } from "./src/merge.mjs";
import { lookupZip, ZipError, normalizeZip } from "./src/geocode.mjs";
import { searchEvents, rinkOptions, TYPE_IDS, DEFAULT_RADIUS_MILES, RADIUS_CHOICES, HOUR_CHOICES } from "./src/query.mjs";
import { homePage, searchPage, rinksPage, rinkPage, aboutPage, notFoundPage } from "./src/pages.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, "data", "events.json");
const sourcesPath = path.join(root, "data", "sources.json");
const zipPath = path.join(root, "data", "zipcodes.json");
const publicPath = path.join(root, "public");
const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? "127.0.0.1";
const refreshMinutes = Math.max(10, Number(process.env.REFRESH_MINUTES ?? 360));
const HOME_ZIP = process.env.HOME_ZIP ?? "01960";
let refreshing = false;

async function readJson(filename) { return JSON.parse(await readFile(filename, "utf8")); }
async function readEvents() {
  // data/events.json is derived and not tracked in git; a fresh checkout has no cache yet.
  try { return await readJson(dataPath); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { updatedAt: null, events: [], sourceStatus: {} };
  }
}
async function saveJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(value, null, 2) + "\n");
}

/* ------------------------------------------------------------------ collect */

export async function refresh() {
  if (refreshing) return { skipped: true, message: "A refresh is already running." };
  refreshing = true;

  try {
    const sources = await readJson(sourcesPath);
    const prior = await readEvents();
    const outcomes = [];

    for (const source of sources) {
      if (!source.enabled) {
        outcomes.push({ id: source.id, state: "disabled", message: source.notes });
        continue;
      }
      try {
        const result = await collect(source);
        outcomes.push({ id: source.id, state: result.status, events: result.events, message: result.message });
      } catch (error) {
        outcomes.push({ id: source.id, state: "error", message: error.message });
      }
    }

    const next = mergeCollection({ sources, prior, outcomes });
    await saveJson(dataPath, next);
    return next;
  } finally {
    refreshing = false;
  }
}

/* ------------------------------------------------------------------ helpers */

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

const sendHtml = (response, status, body) => send(response, status, body, "text/html; charset=utf-8");

function contentType(file) {
  return file.endsWith(".html") ? "text/html; charset=utf-8"
    : file.endsWith(".js") ? "text/javascript; charset=utf-8"
    : file.endsWith(".css") ? "text/css; charset=utf-8"
    : "application/octet-stream";
}

/** Sessions carry their rink's id; price and notes live on the source record. */
function withRinkDetails(events, sources) {
  const byId = new Map(sources.map(source => [source.id, source]));
  return events.map(event => {
    const source = byId.get(event.rinkId);
    return source?.price ? { ...event, price: source.price } : event;
  });
}

function readSearchQuery(url) {
  if (url.searchParams.get("reset")) {
    return { zip: HOME_ZIP, radius: DEFAULT_RADIUS_MILES, types: TYPE_IDS, after: null, before: null };
  }
  const requestedTypes = url.searchParams.getAll("type").filter(type => TYPE_IDS.includes(type));
  const radius = Number(url.searchParams.get("radius"));
  const weekday = url.searchParams.get("weekday");
  const hour = name => {
    const value = Number(url.searchParams.get(name));
    return HOUR_CHOICES.some(choice => choice.value === value) ? value : null;
  };
  return {
    zip: (url.searchParams.get("zip") ?? HOME_ZIP).trim(),
    radius: RADIUS_CHOICES.includes(radius) ? radius : DEFAULT_RADIUS_MILES,
    // No boxes ticked reads as "no preference" rather than "show me nothing".
    types: requestedTypes.length > 0 ? requestedTypes : TYPE_IDS,
    rink: url.searchParams.get("rink") || null,
    weekday: weekday === null || weekday === "" ? null : Number(weekday),
    start: url.searchParams.get("start") || null,
    end: url.searchParams.get("end") || null,
    after: hour("after"),
    before: hour("before")
  };
}

async function resolveLocation(zip) {
  if (!zip) return { location: null, error: null };
  let cache = {};
  try { cache = await readJson(zipPath); } catch { cache = {}; }
  const known = Object.keys(cache).length;
  try {
    const location = await lookupZip(zip, { cache });
    if (Object.keys(cache).length !== known) await saveJson(zipPath, cache);
    return { location, error: null };
  } catch (error) {
    if (error instanceof ZipError) return { location: null, error: error.message };
    throw error;
  }
}

/* ------------------------------------------------------------------- routes */

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const { pathname } = url;

  if (request.method === "POST" && pathname === "/api/refresh") {
    const result = await refresh();
    return send(response, 200, JSON.stringify({
      updatedAt: result.updatedAt ?? null,
      events: result.events?.length ?? null,
      message: result.message ?? "Schedules refreshed."
    }));
  }

  if (request.method !== "GET") return send(response, 405, "Method not allowed", "text/plain");

  const [data, sources] = await Promise.all([readEvents(), readJson(sourcesPath)]);
  const events = withRinkDetails(data.events, sources);

  if (pathname === "/api/sources") return send(response, 200, JSON.stringify(sources));

  if (pathname === "/api/events") {
    const query = readSearchQuery(url);
    const { location } = await resolveLocation(query.zip);
    const result = searchEvents(events, {
      origin: location, radiusMiles: query.radius, types: query.types,
      rinkId: query.rink, weekday: query.weekday, startDate: query.start, endDate: query.end,
      afterHour: query.after, beforeHour: query.before
    });
    return send(response, 200, JSON.stringify({ updatedAt: data.updatedAt, sourceStatus: data.sourceStatus, events: result.events }));
  }

  if (pathname === "/") {
    const upcoming = searchEvents(events, { types: TYPE_IDS });
    return sendHtml(response, 200, homePage({ sources, events: upcoming.events, updatedAt: data.updatedAt, homeZip: HOME_ZIP }));
  }

  if (pathname === "/search") {
    const query = readSearchQuery(url);
    const { location, error } = await resolveLocation(query.zip);
    const result = searchEvents(events, {
      origin: location,
      radiusMiles: location ? query.radius : null,
      types: query.types, rinkId: query.rink, weekday: query.weekday,
      startDate: query.start, endDate: query.end,
      afterHour: query.after, beforeHour: query.before
    });
    return sendHtml(response, 200, searchPage({
      query, result, location, error,
      rinks: rinkOptions(events, sources),
      updatedAt: data.updatedAt
    }));
  }

  if (pathname === "/rinks") {
    const upcoming = searchEvents(events, { types: TYPE_IDS });
    return sendHtml(response, 200, rinksPage({
      sources, sourceStatus: data.sourceStatus ?? {}, events: upcoming.events, updatedAt: data.updatedAt
    }));
  }

  if (pathname.startsWith("/rinks/")) {
    const id = decodeURIComponent(pathname.slice("/rinks/".length));
    const source = sources.find(candidate => candidate.id === id);
    if (!source) return sendHtml(response, 404, notFoundPage());
    const result = searchEvents(events, { types: TYPE_IDS, rinkId: id });
    return sendHtml(response, 200, rinkPage({
      source, status: (data.sourceStatus ?? {})[id], days: result.days, total: result.total
    }));
  }

  if (pathname === "/about") {
    return sendHtml(response, 200, aboutPage({ sources, sourceStatus: data.sourceStatus ?? {}, updatedAt: data.updatedAt }));
  }

  const target = path.resolve(publicPath, pathname.slice(1));
  if (!target.startsWith(publicPath + path.sep)) return send(response, 403, "Forbidden", "text/plain");
  try {
    return send(response, 200, await readFile(target), contentType(target));
  } catch {
    return sendHtml(response, 404, notFoundPage());
  }
}

/* --------------------------------------------------------------------- boot */

if (process.argv.includes("--refresh")) {
  const result = await refresh();
  console.log(`Updated ${result.events?.length ?? 0} events at ${result.updatedAt ?? "(not completed)"}.`);
} else {
  const server = http.createServer((request, response) =>
    handler(request, response).catch(error => send(response, 500, JSON.stringify({ error: error.message }))));
  // A copy left running from an earlier session keeps the port and keeps serving its own
  // (older) code, which looks exactly like a change that did not take effect.
  server.on("error", error => {
    if (error.code !== "EADDRINUSE") throw error;
    console.error(`Port ${port} is already in use — another copy of OpenIce is probably still running.`);
    console.error(`  Stop it:  kill $(lsof -ti :${port})`);
    console.error(`  Or:       PORT=${port + 1} npm start`);
    process.exit(1);
  });
  server.listen(port, host, () => console.log(`OpenIce: http://${host}:${port}`));
  refresh().catch(error => console.error("Initial refresh failed:", error.message));
  setInterval(() => refresh().catch(error => console.error("Scheduled refresh failed:", error.message)), refreshMinutes * 60 * 1000).unref();
}
