(function exposeDiningHours(global) {
  const SOURCE = 'https://dining.columbia.edu/content/locations-hours';
  const LEGACY_CONTRACT = Object.freeze({
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
  const CONTRACT = Object.freeze({
    ...LEGACY_CONTRACT,
    'cafe-east': { sourceId: 'cafe-east', category: 'cafe' },
  });
  const LEGACY_STATIC_FALLBACK_IDS = Object.freeze(['joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge']);
  const STATIC_FALLBACK_IDS = Object.freeze(['joe-noco', 'joe-journalism', 'joe-dodge']);
  const LEGACY_SOURCE_CONTRACT = Object.freeze({
    'locations-feed': 'https://dining.columbia.edu/content/locations-hours',
    'nsop-2026': 'https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service',
    'labor-day-2026': 'https://dining.columbia.edu/news/labor-day-2026-operating-hours',
    'fall-2026': 'https://dining.columbia.edu/news/fall-2026-operating-hours',
  });
  const SOURCE_CONTRACT = Object.freeze({
    ...LEGACY_SOURCE_CONTRACT,
    'cafe-east': 'https://lernerhall.columbia.edu/content/cafe-east',
  });
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

  function validText(value, limit) {
    return typeof value === 'string' && value.trim() && value.length <= limit
      && !/[<>\u0000-\u001f]/.test(value);
  }

  function validIntervals(value) {
    if (!Array.isArray(value)) return false;
    let priorEnd = -1;
    const toMinutes = (time) => time === '24:00'
      ? 1440
      : Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    for (const interval of value) {
      if (!Array.isArray(interval) || interval.length !== 2
        || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) return false;
      const start = toMinutes(interval[0]);
      let end = toMinutes(interval[1]);
      if (end <= start) end += 1440;
      if (start < priorEnd) return false;
      priorEnd = end;
    }
    return true;
  }

  function exactKeys(value, expected) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
  }

  function validateSnapshot(snapshot) {
    const versionTwo = snapshot?.schemaVersion === 2;
    const versionThree = snapshot?.schemaVersion === 3;
    const hasProvenance = versionTwo || versionThree;
    const contract = versionThree ? CONTRACT : LEGACY_CONTRACT;
    const sourceContract = versionThree ? SOURCE_CONTRACT : LEGACY_SOURCE_CONTRACT;
    if (!snapshot || (snapshot.schemaVersion !== 1 && !hasProvenance) || snapshot.source !== SOURCE
      || typeof snapshot.generated !== 'string' || Number.isNaN(Date.parse(snapshot.generated))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.generated)
      || !ISO_DATE.test(snapshot.windowStart || '') || snapshot.windowEnd !== addDays(snapshot.windowStart, 13)
      || !Array.isArray(snapshot.locations) || snapshot.locations.length !== Object.keys(contract).length) {
      return null;
    }
    if (hasProvenance && !exactKeys(snapshot, [
      'schemaVersion', 'generated', 'source', 'windowStart', 'windowEnd', 'sources', 'locations', 'specialServices',
    ])) return null;
    const byId = new Map();
    for (const location of snapshot.locations) {
      if (!location || typeof location.id !== 'string' || byId.has(location.id)) return null;
      const locationContract = contract[location.id];
      if (!locationContract || location.sourceId !== locationContract.sourceId
        || location.category !== locationContract.category
        || typeof location.name !== 'string' || !location.name.trim()
        || !Array.isArray(location.days) || location.days.length !== 14) return null;
      if (hasProvenance && !exactKeys(location, ['id', 'sourceId', 'category', 'name', 'days'])) return null;
      for (let index = 0; index < 14; index += 1) {
        const day = location.days[index];
        if (!day || day.date !== addDays(snapshot.windowStart, index)
          || !validIntervals(day.intervals) || !validStatus(day.status)) return null;
        if (hasProvenance) {
          if (!exactKeys(day, ['date', 'intervals', 'status', 'sourceId'])) return null;
          const sourceIds = [...Object.keys(sourceContract), 'unpublished'];
          if (!sourceIds.includes(day.sourceId) || day.sourceId === 'nsop-2026') return null;
          if (day.sourceId === 'unpublished'
            && (day.status !== 'Hours not published' || day.intervals.length)) return null;
        }
      }
      byId.set(location.id, location);
    }
    if (!Object.keys(contract).every((id) => byId.has(id))) return null;
    if (!hasProvenance) return { byId, locationIds: Object.keys(contract), specialServices: [] };
    const sourceIds = Object.keys(sourceContract);
    if (!Array.isArray(snapshot.sources) || snapshot.sources.length !== sourceIds.length) return null;
    const seenSources = new Set();
    for (const source of snapshot.sources) {
      if (!exactKeys(source, ['id', 'url', 'fetchedAt'])
        || !(source.id in sourceContract) || seenSources.has(source.id)
        || source.url !== sourceContract[source.id] || source.fetchedAt !== snapshot.generated) return null;
      seenSources.add(source.id);
    }
    if (seenSources.size !== sourceIds.length || !Array.isArray(snapshot.specialServices)
      || snapshot.specialServices.length > 1) return null;
    const specialServices = [];
    for (const service of snapshot.specialServices) {
      if (!exactKeys(service, ['id', 'name', 'audience', 'sourceId', 'countsAsOpen', 'days'])
        || service.id !== 'nsop-2026' || service.sourceId !== 'nsop-2026'
        || service.countsAsOpen !== false || !validText(service.name, 120)
        || !validText(service.audience, 240) || !Array.isArray(service.days)
        || !service.days.length || service.days.length > 6) return null;
      const days = [];
      let priorDate = '';
      for (const day of service.days) {
        if (!exactKeys(day, ['date', 'status', 'sessions'])
          || !ISO_DATE.test(day.date || '') || day.date < snapshot.windowStart
          || day.date > snapshot.windowEnd || (priorDate && day.date <= priorDate)
          || !validText(day.status, 200) || !Array.isArray(day.sessions) || day.sessions.length > 3) return null;
        priorDate = day.date;
        const sessions = [];
        for (const session of day.sessions) {
          if (!exactKeys(session, ['label', 'open', 'close'])
            || !validText(session.label, 80) || !OPEN_TIME.test(session.open || '')
            || !CLOSE_TIME.test(session.close || '') || session.close <= session.open) return null;
          sessions.push({ label: session.label, open: session.open, close: session.close });
        }
        days.push({ date: day.date, status: day.status, sessions });
      }
      specialServices.push({
        id: service.id,
        name: service.name,
        audience: service.audience,
        sourceId: service.sourceId,
        countsAsOpen: false,
        days,
      });
    }
    return { byId, locationIds: Object.keys(contract), specialServices };
  }

  function buildUpdates(snapshot, venues, today) {
    if (!ISO_DATE.test(today || '')) return { ok: false };
    const validated = validateSnapshot(snapshot);
    if (!validated) return { ok: false };
    const { byId, locationIds, specialServices } = validated;
    const firstIndex = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${snapshot.windowStart}T12:00:00Z`)) / 86400000);
    if (firstIndex < 0 || firstIndex + 7 > 14) return { ok: false };

    const entries = [];
    for (const id of locationIds) {
      const venue = venues.find((item) => item.id === id);
      if (!venue) continue;
      const days = byId.get(id).days.slice(firstIndex, firstIndex + 7);
      const hours = {};
      const sourceStatuses = {};
      const sourceIds = {};
      for (const day of days) {
        const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        hours[dow] = day.intervals.map((interval) => [interval[0], interval[1]]);
        sourceStatuses[dow] = day.status;
        sourceIds[dow] = day.sourceId || 'locations-feed';
      }
      const todayStatus = days[0].status;
      entries.push([venue, {
        hours,
        sourceStatuses,
        sourceIds,
        sourceNote: todayStatus && !/^closed\b/i.test(todayStatus) ? todayStatus : null,
        diningLive: true,
      }]);
    }
    const staticFallbackIds = snapshot.schemaVersion === 3
      ? STATIC_FALLBACK_IDS
      : LEGACY_STATIC_FALLBACK_IDS;
    return { ok: true, entries, staticFallbackIds, specialServices };
  }

  async function hydrate({
    venues,
    fetchImpl = global.fetch,
    render,
    setStatus = () => {},
    setSpecialServices = () => {},
    today,
    now = new Date(),
  }) {
    try {
      const response = await fetchImpl('/api/dining-hours', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const snapshot = await response.json();
      const updates = buildUpdates(snapshot, venues, today);
      if (!updates.ok) throw new Error('invalid-data');
      setSpecialServices(updates.specialServices);
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
