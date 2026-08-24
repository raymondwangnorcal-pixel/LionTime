(function exposeStudentServicesHours(global) {
  'use strict';

  const CONTRACT = Object.freeze({
    'alice-health': 'health', bookstore: 'bookstore', caps: 'health', disability: 'health',
    immunization: 'health', lerner: 'lerner', 'mail-center': 'mail', medical: 'health',
    'student-insurance': 'health', svr: 'health',
  });
  const SOURCES = Object.freeze({
    bookstore: 'https://columbia.bncollege.com/',
    health: 'https://www.health.columbia.edu/content/hours-and-locations',
    lerner: 'https://lernerhall.columbia.edu/',
    mail: 'https://mailservices.columbia.edu/content/locations-hours',
  });
  const ACCESS_TYPES = new Set([
    'appointment-only', 'office-hours', 'open-access', 'phone-support', 'virtual-only', 'walk-in',
  ]);
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

  function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function exact(value, keys) {
    return isRecord(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  }
  function addDays(value, amount) {
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }
  function validIntervals(value) {
    if (!Array.isArray(value)) return false;
    let priorEnd = -1;
    return value.every(interval => {
      if (!Array.isArray(interval) || interval.length !== 2 || !OPEN_TIME.test(interval[0] || '')
        || !CLOSE_TIME.test(interval[1] || '')) return false;
      const start = Number(interval[0].slice(0, 2)) * 60 + Number(interval[0].slice(3));
      const end = interval[1] === '24:00' ? 1440 : Number(interval[1].slice(0, 2)) * 60 + Number(interval[1].slice(3));
      if (end <= start || start < priorEnd) return false;
      priorEnd = end;
      return true;
    });
  }
  function validAvailability(value) {
    return exact(value, ['type', 'intervals', 'status', 'reason'])
      && ACCESS_TYPES.has(value.type) && validIntervals(value.intervals)
      && (value.status === null || value.status === 'Closed' || value.status === 'Needs verification')
      && (value.reason === null || (typeof value.reason === 'string' && value.reason.length <= 200 && !/[<>]/.test(value.reason)));
  }
  function validDay(day, date, sourceId, venueId) {
    return exact(day, ['date', 'availabilities', 'sourceRefs', 'evidenceRefs'])
      && day.date === date && Array.isArray(day.availabilities) && day.availabilities.every(validAvailability)
      && Array.isArray(day.sourceRefs) && day.sourceRefs.length === 1 && day.sourceRefs[0] === sourceId
      && Array.isArray(day.evidenceRefs) && day.evidenceRefs.every(ref => typeof ref === 'string' && ref.startsWith(`${sourceId}:${venueId}:`));
  }
  function validVenue(venue, sourceId) {
    if (!exact(venue, ['id', 'name', 'location', 'days']) || CONTRACT[venue.id] !== sourceId
      || typeof venue.name !== 'string' || typeof venue.location !== 'string'
      || !Array.isArray(venue.days) || venue.days.length !== 14 || !ISO_DATE.test(venue.days[0]?.date || '')) return false;
    return venue.days.every((day, index) => validDay(day, addDays(venue.days[0].date, index), sourceId, venue.id));
  }
  function validSource(source, expectedId) {
    if (!exact(source, ['sourceId', 'sourceUrl', 'lastAttemptAt', 'lastAttemptResult', 'failureCode', 'lastSuccessAt', 'venues'])
      || source.sourceId !== expectedId || source.sourceUrl !== SOURCES[expectedId]
      || Number.isNaN(Date.parse(source.lastAttemptAt)) || !['success', 'failure'].includes(source.lastAttemptResult)
      || (source.lastSuccessAt !== null && Number.isNaN(Date.parse(source.lastSuccessAt)))
      || !Array.isArray(source.venues)) return false;
    if (source.lastSuccessAt === null) return source.venues.length === 0;
    const expectedIds = Object.keys(CONTRACT).filter(id => CONTRACT[id] === expectedId).sort();
    return source.venues.map(venue => venue.id).join(',') === expectedIds.join(',')
      && source.venues.every(venue => validVenue(venue, expectedId));
  }
  function globalShape(snapshot) {
    return exact(snapshot, ['schemaVersion', 'generated', 'windowStart', 'windowEnd', 'sources'])
      && snapshot.schemaVersion === 1 && !Number.isNaN(Date.parse(snapshot.generated))
      && ISO_DATE.test(snapshot.windowStart || '') && snapshot.windowEnd === addDays(snapshot.windowStart, 13)
      && Array.isArray(snapshot.sources) && snapshot.sources.length === 4;
  }

  function sourceState(source, now) {
    if (source.lastSuccessAt === null) return 'verification';
    const age = now.getTime() - Date.parse(source.lastSuccessAt);
    if (age > 24 * 60 * 60 * 1000) return 'verification';
    if (age > 8 * 60 * 60 * 1000 || source.lastAttemptResult === 'failure') return 'stale';
    return 'live';
  }

  function mergeIntervals(availabilities) {
    const sorted = availabilities.flatMap(availability => availability.intervals)
      .map(interval => [...interval]).sort((left, right) => left[0].localeCompare(right[0]));
    const merged = [];
    for (const interval of sorted) {
      const prior = merged[merged.length - 1];
      if (prior && interval[0] <= prior[1]) prior[1] = interval[1] > prior[1] ? interval[1] : prior[1];
      else merged.push(interval);
    }
    return merged;
  }

  function buildUpdates(snapshot, venues, today, now = new Date()) {
    if (!globalShape(snapshot) || !ISO_DATE.test(today || '')) return { ok: false };
    const firstIndex = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${snapshot.windowStart}T12:00:00Z`)) / 86400000);
    if (firstIndex < 0 || firstIndex + 7 > 14) return { ok: false };
    const entries = [];
    const states = [];
    const markFallback = sourceId => {
      for (const [venueId, owner] of Object.entries(CONTRACT)) {
        if (owner !== sourceId) continue;
        const venue = venues.find(item => item.id === venueId);
        if (venue) entries.push([venue, { studentServicesLive: true, studentServicesSourceState: 'verification' }]);
      }
    };
    for (const sourceId of Object.keys(SOURCES).sort()) {
      const matches = snapshot.sources.filter(source => source?.sourceId === sourceId);
      const source = matches.length === 1 ? matches[0] : null;
      if (!source || !validSource(source, sourceId)) {
        states.push({ sourceId, kind: 'verification', applied: false });
        markFallback(sourceId);
        continue;
      }
      const kind = sourceState(source, now);
      states.push({ sourceId, kind, applied: source.lastSuccessAt !== null });
      if (source.lastSuccessAt === null) { markFallback(sourceId); continue; }
      for (const remoteVenue of source.venues) {
        const venue = venues.find(item => item.id === remoteVenue.id);
        if (!venue) continue;
        const venueTodayIndex = remoteVenue.days.findIndex(day => day.date === today);
        if (venueTodayIndex < 0 || venueTodayIndex + 7 > remoteVenue.days.length) {
          entries.push([venue, { studentServicesLive: true, studentServicesSourceState: 'verification' }]);
          continue;
        }
        const days = remoteVenue.days.slice(venueTodayIndex, venueTodayIndex + 7).map(day => structuredClone(day));
        const hours = {};
        for (const day of days) {
          const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
          hours[dow] = mergeIntervals(day.availabilities);
        }
        entries.push([venue, { hours, studentServicesDays: Object.fromEntries(days.map(day => [new Date(`${day.date}T12:00:00Z`).getUTCDay(), day])),
          studentServicesLive: true, studentServicesSourceState: kind, estimated: false }]);
      }
    }
    return { ok: true, entries, states };
  }

  async function hydrate({ venues, fetchImpl = global.fetch, render, restore = render, setStatus = () => {}, today, now = new Date() }) {
    try {
      const response = await fetchImpl('/api/student-services-hours', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const snapshot = await response.json();
      const updates = buildUpdates(snapshot, venues, today, now);
      if (!updates.ok || !updates.entries.length) throw new Error('invalid-data');
      const previous = updates.entries.map(([venue, next]) => [venue, Object.fromEntries(Object.keys(next).map(key => [key, venue[key]]))]);
      try {
        for (const [venue, next] of updates.entries) Object.assign(venue, next);
        render();
      } catch (error) {
        for (const [venue, prior] of previous) Object.assign(venue, prior);
        restore();
        throw error;
      }
      const status = {
        kind: updates.states.some(state => state.kind === 'verification') ? 'verification'
          : updates.states.some(state => state.kind === 'stale') ? 'stale' : 'live',
        generated: snapshot.generated,
        updatedCount: updates.entries.length,
        totalCount: Object.keys(CONTRACT).length,
        liveSourceCount: updates.states.filter(state => state.applied && state.kind !== 'verification').length,
        totalSources: Object.keys(SOURCES).length,
        states: updates.states,
      };
      setStatus(status);
      return { applied: true, ...status };
    } catch (error) {
      setStatus({ kind: 'fallback' });
      return { applied: false, reason: error?.message || 'network-error' };
    }
  }

  global.LionHourStudentServicesHours = { buildUpdates, hydrate };
})(globalThis);
