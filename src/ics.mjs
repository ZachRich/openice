import { createHash } from "node:crypto";
import { SESSION_TYPES, TYPE_IDS, WEEKDAYS, typeLabel } from "./query.mjs";

/**
 * Publishing the search results as a calendar feed.
 *
 * The point is a phone: subscribe once and available ice sits beside your real commitments,
 * so deciding is a glance rather than a visit to a website you have to remember to open.
 *
 * Three decisions worth keeping:
 *
 * - Events are TRANSPARENT. These are opportunities, not commitments; marking them busy
 *   would make you look unavailable for ice you never agreed to skate.
 * - UIDs are stable for a given session, so a client updates an event in place across
 *   refreshes instead of accumulating duplicates.
 * - DTSTAMP is the collection time, not the moment of the request, so every fetch between
 *   two refreshes is byte-identical and a client polling faster than the collector sees
 *   nothing change. It still moves when the collector runs, which is honest: that is when
 *   the schedule was actually last confirmed.
 *
 * Removal is by omission: a subscribed feed replaces its whole collection, so a session
 * the rink cancelled simply stops being published and disappears from the calendar.
 */

const PRODID = "-//OpenIce//Walk-on ice//EN";
/** Tell subscribers how often this is worth re-fetching, in the collector's real cadence. */
export function refreshDuration(minutes = 360) {
  const total = Math.max(1, Math.round(Number(minutes) || 360));
  return total % 60 === 0 ? `PT${total / 60}H` : `PT${total}M`;
}

/** RFC 5545 text escaping: backslash, semicolon and comma are literals; newlines are \n. */
export function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Content lines are limited to 75 octets. Folding counts bytes, not characters — a rink
 * called "McVann–O'Keefe" carries a multi-byte dash, and splitting inside it corrupts the feed.
 */
export function foldLine(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const pieces = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut between the bytes of one character.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    pieces.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines spend one octet on their leading space
  }
  return pieces.join("\r\n ");
}

/** 2026-09-10T16:00:00.000Z -> 20260910T160000Z */
export function formatUtc(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Stable across refreshes, readable enough to trace back to a rink. */
export function eventUid(event) {
  const digest = createHash("sha1").update(event.id ?? `${event.rinkId}:${event.start}`).digest("hex");
  return `${event.rinkId}-${digest.slice(0, 16)}@openice.us`;
}

function describe(event) {
  const parts = [];
  if (event.title && event.title.toLowerCase() !== typeLabel(event.type).toLowerCase()) {
    parts.push(`Posted by the rink as "${event.title}".`);
  }
  if (event.price) parts.push(`Listed price: ${event.price}.`);
  if (typeof event.distanceMiles === "number") parts.push(`${event.distanceMiles} miles from your search.`);
  if (event.staleSince) {
    parts.push(`The rink's page was unreachable at the last check, so this is the schedule it last published.`);
  }
  parts.push("Rinks pull walk-on ice for rentals and events, often the same day. Check the rink's page before travelling.");
  if (event.sourceUrl) parts.push(event.sourceUrl);
  return parts.join("\n\n");
}

function eventBlock(event, stamp) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${eventUid(event)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeText(`${typeLabel(event.type)} — ${event.rink}`)}`,
    `DESCRIPTION:${escapeText(describe(event))}`,
    `CATEGORIES:${escapeText(typeLabel(event.type))}`,
    // Available ice is an opportunity, not a commitment: never mark the subscriber busy.
    "TRANSP:TRANSPARENT",
    "STATUS:CONFIRMED"
  ];
  if (event.address) lines.push(`LOCATION:${escapeText(event.address)}`);
  if (event.sourceUrl) lines.push(`URL:${escapeText(event.sourceUrl)}`);
  if (typeof event.latitude === "number" && typeof event.longitude === "number") {
    lines.push(`GEO:${event.latitude};${event.longitude}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/** A human-readable name for the subscription, describing what was filtered. */
export function calendarName(query = {}) {
  const types = query.types ?? TYPE_IDS;
  const label = types.length === TYPE_IDS.length
    ? "Walk-on ice"
    : types.map(type => SESSION_TYPES.find(candidate => candidate.id === type)?.label ?? type).join(" & ");
  const where = query.zip ? ` within ${query.radius} mi of ${query.zip}` : "";
  const day = query.weekday === null || query.weekday === undefined
    ? "" : `, ${WEEKDAYS.find(weekday => weekday.id === Number(query.weekday))?.label}s only`;
  return `OpenIce · ${label}${where}${day}`;
}

export function buildCalendar({ events = [], query = {}, updatedAt = null, refreshMinutes = 360 } = {}) {
  const stamp = formatUtc(updatedAt ?? new Date());
  const refresh = refreshDuration(refreshMinutes);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName(query))}`,
    `X-WR-CALDESC:${escapeText("Publicly posted stick & puck, pickup hockey and public skate sessions, collected by OpenIce.")}`,
    "X-WR-TIMEZONE:America/New_York",
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
    ...events.flatMap(event => eventBlock(event, stamp)),
    "END:VCALENDAR"
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
