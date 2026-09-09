import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return readFileSync(path.join(here, "fixtures", name), "utf8");
}

/** A source record shaped like the entries in data/sources.json. */
export function source(overrides = {}) {
  return {
    id: "test-rink",
    name: "Test Rink",
    town: "Testville",
    address: "1 Test St, Testville, MA 01960",
    latitude: 42.54,
    longitude: -70.95,
    sourceUrl: "https://example.org/schedule",
    ...overrides
  };
}

const easternFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

/** "2026-10-06 12:00" — asserting in Eastern wall-clock makes DST errors visible. */
export function eastern(value) {
  const parts = easternFormat.formatToParts(new Date(value))
    .reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** Compact, readable shape for comparing whole result sets. */
export function summarize(events) {
  return events.map(event => `${eastern(event.start)} ${event.type} ${event.title}`);
}
