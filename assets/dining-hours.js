(function exposeDiningHours(global) {
  const SOURCE = 'https://dining.columbia.edu/content/locations-hours';
  const CONTRACT = Object.freeze({
    'bj-everett': { sourceId: '7482', category: 'cafe' },
    'bj-butler': { sourceId: '56', category: 'cafe' },
    'bj-uris': { sourceId: '60', category: 'cafe' },
    'bj-mudd': { sourceId: '57', category: 'cafe' },
    chefdons: { sourceId: '6990', category: 'dining' },
    chefmikes: { sourceId: '6907', category: 'dining' },
    facultyhouse: { sourceId: '7351', category: 'dining' },
    'facultyhouse-4': { sourceId: '7850', category: 'dining' },
    ferris: { sourceId: '12', category: 'dining' },
    gracedodge: { sourceId: '7355', category: 'dining' },
    jjs: { sourceId: '11', category: 'dining' },
    johnjay: { sourceId: '10', category: 'dining' },
    johnnys: { sourceId: '9727', category: 'dining' },
    'lenfest-cafe': { sourceId: '58', category: 'cafe' },
    'smith-dining': { sourceId: '7452', category: 'dining' },
    facshack: { sourceId: '7487', category: 'dining' },
  });
  const STATIC_FALLBACK_IDS = Object.freeze(['joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge']);
  const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function addDays(date, count) {
    const value = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(value.getTime())) return null;
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
  }

  function validStatus(value) {
    return value === null || (typeof value === 'string' && value.length <= 160
      && !/[<>\u0000-\u001f]/.test(value));
  }

  function validIntervals(value) {
    return Array.isArray(value) && value.every((interval) => Array.isArray(interval)
      && interval.length === 2 && OPEN_TIME.test(interval[0] || '') && CLOSE_TIME.test(interval[1] || ''));
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.source !== SOURCE
      || typeof snapshot.generated !== 'string' || Number.isNaN(Date.parse(snapshot.generated))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.generated)
      || !ISO_DATE.test(snapshot.windowStart || '') || snapshot.windowEnd !== addDays(snapshot.windowStart, 13)
      || !Array.isArray(snapshot.locations) || snapshot.locations.length !== Object.keys(CONTRACT).length) {
      return null;
    }
    const byId = new Map();
    for (const location of snapshot.locations) {
      if (!location || typeof location.id !== 'string' || byId.has(location.id)) return null;
      const contract = CONTRACT[location.id];
      if (!contract || location.sourceId !== contract.sourceId || location.category !== contract.category
        || typeof location.name !== 'string' || !location.name.trim()
        || !Array.isArray(location.days) || location.days.length !== 14) return null;
      for (let index = 0; index < 14; index += 1) {
        const day = location.days[index];
        if (!day || day.date !== addDays(snapshot.windowStart, index)
          || !validIntervals(day.intervals) || !validStatus(day.status)) return null;
      }
      byId.set(location.id, location);
    }
    return Object.keys(CONTRACT).every((id) => byId.has(id)) ? byId : null;
  }

  function buildUpdates(snapshot, venues, today) {
    if (!ISO_DATE.test(today || '')) return { ok: false };
    const byId = validateSnapshot(snapshot);
    if (!byId) return { ok: false };
    const firstIndex = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${snapshot.windowStart}T12:00:00Z`)) / 86400000);
    if (firstIndex < 0 || firstIndex + 7 > 14) return { ok: false };

    const entries = [];
    for (const id of Object.keys(CONTRACT)) {
      const venue = venues.find((item) => item.id === id);
      if (!venue) return { ok: false };
      const days = byId.get(id).days.slice(firstIndex, firstIndex + 7);
      const hours = {};
      const sourceStatuses = {};
      for (const day of days) {
        const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        hours[dow] = day.intervals.map((interval) => [interval[0], interval[1]]);
        sourceStatuses[dow] = day.status;
      }
      const todayStatus = days[0].status;
      entries.push([venue, {
        hours,
        sourceStatuses,
        sourceNote: todayStatus && !/^closed\b/i.test(todayStatus) ? todayStatus : null,
        diningLive: true,
      }]);
    }
    return { ok: true, entries, staticFallbackIds: STATIC_FALLBACK_IDS };
  }

  async function hydrate({
    venues,
    fetchImpl = global.fetch,
    render,
    setStatus = () => {},
    today,
    now = new Date(),
  }) {
    try {
      const response = await fetchImpl('/api/dining-hours', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const snapshot = await response.json();
      const updates = buildUpdates(snapshot, venues, today);
      if (!updates.ok) throw new Error('invalid-data');
      for (const [venue, next] of updates.entries) Object.assign(venue, next);
      render();
      const stale = now.getTime() - Date.parse(snapshot.generated) > 8 * 60 * 60 * 1000;
      const status = {
        kind: stale ? 'stale' : 'partial',
        generated: snapshot.generated,
        updatedCount: updates.entries.length,
        totalCount: updates.entries.length + updates.staticFallbackIds.length,
        staticFallbackIds: updates.staticFallbackIds,
      };
      setStatus(status);
      return { applied: true, stale, ...status };
    } catch (error) {
      setStatus({ kind: 'fallback' });
      return { applied: false, reason: error?.message || 'network-error' };
    }
  }

  global.LionHourDiningHours = { buildUpdates, hydrate };
})(globalThis);
