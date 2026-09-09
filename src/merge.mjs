/**
 * Deciding what a refresh keeps.
 *
 * A refresh used to rebuild the whole schedule from the sources that answered this pass,
 * so one timeout dropped a rink entirely until the next cycle — six hours of a rink simply
 * not existing, with nothing on the page to say why. A failed fetch is almost always a
 * transient network problem, and yesterday's schedule for that rink is far closer to the
 * truth than no schedule at all.
 *
 * So a failed source keeps what it last returned, marked with when it was last confirmed,
 * until that becomes too old to stand behind. Past the limit the events are dropped: an
 * unconfirmed schedule is worth showing for a day, not for a week.
 */

export const STALE_LIMIT_HOURS = 48;

function groupByRink(events = []) {
  const grouped = new Map();
  for (const event of events) {
    if (!grouped.has(event.rinkId)) grouped.set(event.rinkId, []);
    grouped.get(event.rinkId).push(event);
  }
  return grouped;
}

/**
 * @param sources   the source records, in order
 * @param prior     the previous { events, sourceStatus }
 * @param outcomes  one per source: { id, state: "ok"|"needs-adapter", events, message }
 *                  | { id, state: "disabled", message } | { id, state: "error", message }
 */
export function mergeCollection({ sources, prior = {}, outcomes = [], now = new Date(), staleLimitHours = STALE_LIMIT_HOURS }) {
  const previousEvents = groupByRink(prior.events);
  const previousStatus = prior.sourceStatus ?? {};
  const checkedAt = now.toISOString();
  const events = [];
  const sourceStatus = {};

  for (const source of sources) {
    const outcome = outcomes.find(candidate => candidate.id === source.id)
      ?? { id: source.id, state: "error", message: "The source was not checked." };
    const previous = previousStatus[source.id] ?? {};

    if (outcome.state === "disabled") {
      sourceStatus[source.id] = { state: "disabled", checkedAt, message: outcome.message };
      continue;
    }

    if (outcome.state !== "error") {
      events.push(...outcome.events);
      sourceStatus[source.id] = {
        state: outcome.state,
        checkedAt,
        lastSuccessAt: checkedAt,
        message: outcome.message,
        count: outcome.events.length
      };
      continue;
    }

    const lastSuccessAt = previous.lastSuccessAt ?? previous.checkedAt ?? null;
    const ageHours = lastSuccessAt ? (now - new Date(lastSuccessAt)) / 3_600_000 : Infinity;
    const held = previousEvents.get(source.id) ?? [];
    const keep = ageHours <= staleLimitHours ? held : [];

    events.push(...keep.map(event => ({ ...event, staleSince: lastSuccessAt })));
    sourceStatus[source.id] = {
      state: "error",
      checkedAt,
      lastSuccessAt,
      message: outcome.message,
      count: keep.length,
      retained: keep.length > 0,
      // Worth saying out loud: the rink's sessions were dropped, not merely unrefreshed.
      dropped: keep.length === 0 && held.length > 0
    };
  }

  // Sources removed from sources.json fall out of sourceStatus rather than lingering.
  return {
    updatedAt: checkedAt,
    events: events.sort((a, b) => new Date(a.start) - new Date(b.start)),
    sourceStatus
  };
}
