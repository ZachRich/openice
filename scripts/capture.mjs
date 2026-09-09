#!/usr/bin/env node
// Save a live source response into test/fixtures/ so parser changes can be checked
// against the real page instead of a hand-built approximation.
//
//   npm run capture -- peabody-mcvann-okeefe
//   npm run capture -- all
//
// Run this from a machine with internet access. Review what you capture before
// committing it: these files are snapshots of public pages, nothing more.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures = path.join(root, "test", "fixtures");
const sources = JSON.parse(await readFile(path.join(root, "data", "sources.json"), "utf8"));

const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error("Usage: npm run capture -- <source-id|all>");
  console.error("Known ids:", sources.filter(source => source.feedUrl).map(source => source.id).join(", "));
  process.exit(1);
}

const selected = wanted.includes("all")
  ? sources.filter(source => source.feedUrl)
  : sources.filter(source => wanted.includes(source.id));

if (selected.length === 0) {
  console.error("No matching source with a feedUrl.");
  process.exit(1);
}

await mkdir(fixtures, { recursive: true });
for (const source of selected) {
  if (!source.feedUrl) { console.log(`- ${source.id}: no feedUrl, skipped`); continue; }
  try {
    const response = await fetch(source.feedUrl, {
      headers: { "user-agent": "OpenIce/0.1 (+https://openice.us; personal schedule aggregator)" },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    const name = `live-${source.id}.${source.adapter === "ical" ? "ics" : "html"}`;
    await writeFile(path.join(fixtures, name), body);
    console.log(`- ${source.id}: ${body.length.toLocaleString()} bytes -> test/fixtures/${name}`);
  } catch (error) {
    console.log(`- ${source.id}: failed (${error.message})`);
  }
}
