import { SOURCE_VENUE_IDS, STUDENT_SERVICES_VENUES } from './student-services-hours-catalog.js';

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekday(value) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function applies(record, date) {
  if (record.exactDate) return record.exactDate === date;
  return record.effectiveStart <= date && date <= record.effectiveEnd
    && record.weekdays.includes(weekday(date));
}

function resolveDay(sourceId, targetId, records, date) {
  const candidates = records.filter(record => record.targetId === targetId && applies(record, date));
  const exact = candidates.filter(record => record.exactDate === date);
  const selected = exact.length ? exact : candidates.filter(record => !record.exactDate);
  const byType = new Map();
  for (const record of selected) {
    const signature = JSON.stringify([record.intervals, record.status, record.reason]);
    const key = `${record.type}\u0000${record.reason || ''}`;
    const prior = byType.get(key);
    if (prior && prior.signature !== signature) throw new Error(`ambiguous ${sourceId} evidence for ${targetId} on ${date}`);
    byType.set(key, { signature, record });
  }
  const availabilities = [...byType.values()].map(({ record }) => ({
    type: record.type,
    intervals: record.intervals.map(interval => [...interval]),
    status: record.status,
    reason: record.reason,
  })).sort((left, right) => left.type.localeCompare(right.type));
  return {
    date,
    availabilities,
    sourceRefs: [sourceId],
    evidenceRefs: [...new Set(selected.map(record => record.evidenceRef))].sort(),
  };
}

export function resolveStudentServicesSource({ sourceId, evidence, generated = new Date() }) {
  const windowStart = easternDate(generated);
  const windowEnd = addDays(windowStart, 13);
  const venues = SOURCE_VENUE_IDS[sourceId].map(id => ({
    id,
    name: STUDENT_SERVICES_VENUES[id].name,
    location: STUDENT_SERVICES_VENUES[id].location,
    days: Array.from({ length: 14 }, (_unused, index) => {
      const date = addDays(windowStart, index);
      return resolveDay(sourceId, id, evidence, date);
    }),
  }));
  return { sourceId, windowStart, windowEnd, venues };
}

export function buildStudentServicesAttempt({ sourceId, sourceUrl, generated, evidence }) {
  const resolved = resolveStudentServicesSource({ sourceId, evidence, generated });
  return {
    sourceId,
    sourceUrl,
    attemptedAt: generated.toISOString(),
    result: 'success',
    failureCode: null,
    venues: resolved.venues,
  };
}
