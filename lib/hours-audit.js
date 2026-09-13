/**
 * Audit what the site is actually serving.
 *
 * Every check the pipeline had before this one asked "did the job work?" — did the fetch
 * succeed, did the parser throw, did the PUT return. Two incidents in September 2026 got
 * past all of them because the answer was yes every time:
 *
 *  - The publish URL pointed at a host that 308-redirected. curl reported success; the
 *    site served the same snapshot for three days (DEC-0072).
 *  - Columbia reworded its Fall 2026 hours page. `columbiaHours` reported success on every
 *    run, and Uris Pool sat on "Hours need verification" for the whole term.
 *
 * So this asks a different question: is the published snapshot any good? It reads the live
 * endpoints and reports two things that a green run cannot rule out —
 *
 *   stale       the snapshot is older than the freshness budget (DEC-0069 allows a day)
 *   unresolved  a venue carries no usable hours on ANY day of the published window
 *
 * "Any day of the window" is deliberate: a venue closed today is normal, a venue with
 * nothing for fourteen straight days is a pipeline that cannot see it. That needs no
 * history to detect, which is why this is a stateless point-in-time check rather than
 * something that has to remember yesterday.
 *
 * What it does NOT catch: hours that are present, plausible and wrong. Dodge spent a week
 * serving the Blue Gym calendar's envelope — full days, sensible times, simply not its own
 * schedule. Only comparing against the official page catches that; see
 * docs/recreation-hours-operations.md.
 */

export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Venues that are legitimately unresolved and must not page anyone. Each entry needs a
 * reason, and adding one is a deliberate act — an empty venue is the symptom this check
 * exists to report, so the list is the one place that judgement gets recorded.
 */
export const EXPECTED_UNRESOLVED = Object.freeze({
  'recreation:squash-courts': 'reservations only; Columbia publishes no open-recreation hours',
});

const RECREATION_UNAVAILABLE = new Set(['Hours need verification', 'Separate hours not published']);

const hasIntervals = day => Array.isArray(day?.intervals) && day.intervals.length > 0;

/** Reduce each category's own shape to { id, usableDays, totalDays }. */
export const VENUE_READERS = Object.freeze({
  library: snapshot => (snapshot?.libraries || []).map(library => ({
    id: library.id,
    // A library's schedules are weekly, not dated: usable means at least one open day.
    usableDays: (library.schedules || []).some(schedule => Object.values(schedule?.hours || {}).some(Boolean)) ? 1 : 0,
    totalDays: 1,
  })),
  dining: snapshot => (snapshot?.locations || []).map(location => ({
    id: location.id,
    usableDays: (location.days || []).filter(day => hasIntervals(day) || day?.status).length,
    totalDays: (location.days || []).length,
  })),
  'barnard-dining': snapshot => (snapshot?.venues || []).map(venue => ({
    id: venue.id,
    usableDays: (venue.days || []).filter(day => hasIntervals(day) || day?.status).length,
    totalDays: (venue.days || []).length,
  })),
  recreation: snapshot => (snapshot?.facilities || []).flatMap(facility => [
    facility,
    ...(facility.spaces || []),
  ]).map(entry => ({
    id: entry.id,
    usableDays: (entry.days || []).filter(day => (
      hasIntervals(day) || (day?.status && !RECREATION_UNAVAILABLE.has(day.status))
    )).length,
    totalDays: (entry.days || []).length,
  })),
  'student-services': snapshot => (snapshot?.sources || []).flatMap(source => source.venues || []).map(venue => ({
    id: venue.id,
    usableDays: (venue.days || []).filter(day => (day.availabilities || []).some(availability => (
      (Array.isArray(availability.intervals) && availability.intervals.length > 0)
      || availability.status === 'Closed'
    ))).length,
    totalDays: (venue.days || []).length,
  })),
});

export function snapshotAgeMs(snapshot, now = new Date()) {
  const generated = Date.parse(snapshot?.generated);
  return Number.isNaN(generated) ? null : now.getTime() - generated;
}

/**
 * @returns {{ category: string, findings: Array<{ kind: string, id?: string, detail: string }> }}
 */
export function auditCategory({ category, snapshot, now = new Date(), maxAgeMs = MAX_SNAPSHOT_AGE_MS }) {
  const findings = [];
  const read = VENUE_READERS[category];
  if (!read) return { category, findings: [{ kind: 'unknown-category', detail: `no reader for ${category}` }] };
  if (!snapshot || typeof snapshot !== 'object') {
    return { category, findings: [{ kind: 'unreadable', detail: 'the endpoint returned no snapshot' }] };
  }

  const age = snapshotAgeMs(snapshot, now);
  if (age === null) {
    findings.push({ kind: 'unreadable', detail: 'the snapshot has no usable "generated" timestamp' });
  } else if (age > maxAgeMs) {
    findings.push({
      kind: 'stale',
      detail: `published ${formatAge(age)} ago (${snapshot.generated}); the budget is ${formatAge(maxAgeMs)}`,
    });
  }

  const venues = read(snapshot);
  if (!venues.length) findings.push({ kind: 'empty-snapshot', detail: 'the snapshot lists no venues' });
  for (const venue of venues) {
    if (venue.totalDays === 0 || venue.usableDays > 0) continue;
    if (EXPECTED_UNRESOLVED[`${category}:${venue.id}`]) continue;
    findings.push({
      kind: 'unresolved',
      id: venue.id,
      detail: `no hours on any of the ${venue.totalDays} published day${venue.totalDays === 1 ? '' : 's'}`,
    });
  }
  return { category, findings };
}

export function auditAll({ snapshots, now = new Date(), maxAgeMs = MAX_SNAPSHOT_AGE_MS }) {
  const results = Object.entries(snapshots).map(([category, snapshot]) => auditCategory({ category, snapshot, now, maxAgeMs }));
  return { results, ok: results.every(result => result.findings.length === 0) };
}

export function describeAudit({ results }) {
  const failing = results.filter(result => result.findings.length > 0);
  if (!failing.length) return 'Hours audit: every published snapshot is fresh and every venue has hours.';
  const lines = ['Hours audit found problems the scrape runs did not report:'];
  for (const result of failing) {
    for (const finding of result.findings) {
      lines.push(`• ${result.category}${finding.id ? ` / ${finding.id}` : ''} — ${finding.kind}: ${finding.detail}`);
    }
  }
  return lines.join('\n');
}

function formatAge(milliseconds) {
  const hours = milliseconds / 3_600_000;
  if (hours < 1) return `${Math.round(milliseconds / 60_000)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
