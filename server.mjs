import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collect } from "./src/collectors.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(root, "data", "events.json");
const sourcesPath = path.join(root, "data", "sources.json");
const publicPath = path.join(root, "public");
const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? "127.0.0.1";
const refreshMinutes = Math.max(10, Number(process.env.REFRESH_MINUTES ?? 360));
let refreshing = false;

async function readJson(filename) { return JSON.parse(await readFile(filename, "utf8")); }
async function saveJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(value, null, 2) + "\n");
}

export async function refresh() {
  if (refreshing) return { skipped: true, message: "A refresh is already running." };
  refreshing = true;
  const sources = await readJson(sourcesPath);
  const prior = await readJson(dataPath);
  const sourceStatus = { ...prior.sourceStatus };
  const collected = [];

  try {
    for (const source of sources) {
      if (!source.enabled) {
        sourceStatus[source.id] = { state: "disabled", checkedAt: new Date().toISOString(), message: source.notes };
        continue;
      }
      try {
        const result = await collect(source);
        collected.push(...result.events);
        sourceStatus[source.id] = { state: result.status, checkedAt: new Date().toISOString(), message: result.message, count: result.events.length };
      } catch (error) {
        sourceStatus[source.id] = { state: "error", checkedAt: new Date().toISOString(), message: error.message };
      }
    }
    const next = {
      updatedAt: new Date().toISOString(),
      events: collected.sort((a, b) => new Date(a.start) - new Date(b.start)),
      sourceStatus
    };
    await saveJson(dataPath, next);
    return next;
  } finally {
    refreshing = false;
  }
}

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

function contentType(file) {
  return file.endsWith(".html") ? "text/html; charset=utf-8"
    : file.endsWith(".js") ? "text/javascript; charset=utf-8"
    : file.endsWith(".css") ? "text/css; charset=utf-8"
    : "application/octet-stream";
}

async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && url.pathname === "/api/events") {
    const data = await readJson(dataPath);
    const includePickup = url.searchParams.get("pickup") === "true";
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    const events = data.events.filter(event => new Date(event.start) >= new Date() && new Date(event.start) <= until && (includePickup || event.type !== "pickup"));
    return send(response, 200, JSON.stringify({ ...data, events }));
  }
  if (request.method === "GET" && url.pathname === "/api/sources") {
    const sources = await readJson(sourcesPath);
    return send(response, 200, JSON.stringify(sources));
  }
  if (request.method === "POST" && url.pathname === "/api/refresh") {
    const result = await refresh();
    return send(response, 200, JSON.stringify({ updatedAt: result.updatedAt ?? null, refreshing: false, events: result.events?.length ?? null, message: result.message ?? "Schedules refreshed." }));
  }

  const safeName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const target = path.resolve(publicPath, safeName);
  if (!target.startsWith(publicPath + path.sep) && target !== path.join(publicPath, "index.html")) return send(response, 403, "Forbidden", "text/plain");
  try {
    return send(response, 200, await readFile(target), contentType(target));
  } catch {
    return send(response, 404, "Not found", "text/plain");
  }
}

if (process.argv.includes("--refresh")) {
  const result = await refresh();
  console.log(`Updated ${result.events?.length ?? 0} events at ${result.updatedAt ?? "(not completed)"}.`);
} else {
  const server = http.createServer((request, response) => handler(request, response).catch(error => send(response, 500, JSON.stringify({ error: error.message }))));
  server.listen(port, host, () => console.log(`North Shore Ice Finder: http://${host}:${port}`));
  refresh().catch(error => console.error("Initial refresh failed:", error.message));
  setInterval(() => refresh().catch(error => console.error("Scheduled refresh failed:", error.message)), refreshMinutes * 60 * 1000).unref();
}
