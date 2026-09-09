import { parseIcalSchedule } from "./ical.mjs";
import { parseMyRecSchedule, parseWeeklySchedule } from "./web.mjs";

export async function collect(source) {
  const response = await fetch(source.feedUrl, {
    headers: { "user-agent": "OpenIce/0.1 (+https://openice.us; personal schedule aggregator)" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Schedule returned HTTP ${response.status}`);
  const text = await response.text();
  const events = source.adapter === "ical" ? parseIcalSchedule(text, source)
    : source.adapter === "myrec" ? parseMyRecSchedule(text, source)
    : source.adapter === "weekly" ? parseWeeklySchedule(text, source)
    : null;
  if (!events) return { events: [], message: "Awaiting a supported public schedule source", status: "needs-adapter" };
  return { events, message: `Read ${text.length.toLocaleString()} bytes`, status: "ok" };
}
