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
  const V3_CONTRACT = Object.freeze({
    ...LEGACY_CONTRACT,
    'cafe-east': { sourceId: 'cafe-east', category: 'cafe' },
  });
  const BARNARD_IDS = Object.freeze([
    'hewitt', 'diana-center-cafe', 'barnard-bubble-tea-sushi', 'lizs-place',
  ]);
  const CONTRACT = Object.freeze({
    ...V3_CONTRACT,
    hewitt: { sourceId: 'barnard-hours', category: 'dining' },
    'diana-center-cafe': { sourceId: 'barnard-hours', category: 'dining' },
    'barnard-bubble-tea-sushi': { sourceId: 'barnard-hours', category: 'dining' },
    'lizs-place': { sourceId: 'barnard-hours', category: 'cafe' },
  });
  const LEGACY_STATIC_FALLBACK_IDS = Object.freeze([
    'joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge', ...BARNARD_IDS,
  ]);
  const V3_STATIC_FALLBACK_IDS = Object.freeze([
    'joe-noco', 'joe-journalism', 'joe-dodge', ...BARNARD_IDS,
  ]);
  const STATIC_FALLBACK_IDS = Object.freeze(['joe-noco', 'joe-journalism', 'joe-dodge']);
  const LEGACY_SOURCE_CONTRACT = Object.freeze({
    'locations-feed': 'https://dining.columbia.edu/content/locations-hours',
    'nsop-2026': 'https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service',
    'labor-day-2026': 'https://dining.columbia.edu/news/labor-day-2026-operating-hours',
    'fall-2026': 'https://dining.columbia.edu/news/fall-2026-operating-hours',
  });
  const V3_SOURCE_CONTRACT = Object.freeze({
    ...LEGACY_SOURCE_CONTRACT,
    'cafe-east': 'https://lernerhall.columbia.edu/content/cafe-east',
  });
  const SOURCE_CONTRACT = Object.freeze({
    ...V3_SOURCE_CONTRACT,
    'barnard-hours': 'https://dineoncampus.com/barnard/hours-of-operation',
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
    const versionFour = snapshot?.schemaVersion === 4;
    const hasProvenance = versionTwo || versionThree || versionFour;
    const contract = versionFour ? CONTRACT : versionThree ? V3_CONTRACT : LEGACY_CONTRACT;
    const sourceContract = versionFour ? SOURCE_CONTRACT
      : versionThree ? V3_SOURCE_CONTRACT : LEGACY_SOURCE_CONTRACT;
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
          if (locationContract.sourceId === 'barnard-hours'
            && !['barnard-hours', 'unpublished'].includes(day.sourceId)) return null;
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
    const sourceFetchedAt = {};
    for (const source of snapshot.sources) {
      if (!exactKeys(source, ['id', 'url', 'fetchedAt'])
        || !(source.id in sourceContract) || seenSources.has(source.id)
        || source.url !== sourceContract[source.id]
        || typeof source.fetchedAt !== 'string' || Number.isNaN(Date.parse(source.fetchedAt))
        || !/(?:Z|[+-]\d{2}:\d{2})$/.test(source.fetchedAt)
        || (!versionFour && source.fetchedAt !== snapshot.generated)) return null;
      seenSources.add(source.id);
      sourceFetchedAt[source.id] = source.fetchedAt;
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
    return { byId, locationIds: Object.keys(contract), specialServices, sourceFetchedAt };
  }

  function formatEastern(timestamp) {
    return `${new Date(timestamp).toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
    })} ET`;
  }

  function buildUpdates(snapshot, venues, today, now = new Date()) {
    if (!ISO_DATE.test(today || '')) return { ok: false };
    const validated = validateSnapshot(snapshot);
    if (!validated) return { ok: false };
    const { byId, locationIds, specialServices, sourceFetchedAt = {} } = validated;
    const firstIndex = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${snapshot.windowStart}T12:00:00Z`)) / 86400000);
    if (firstIndex < 0 || firstIndex + 7 > 14) return { ok: false };

    const entries = [];
    const dynamicFallbackIds = [];
    let barnardStale = false;
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
      const isBarnard = BARNARD_IDS.includes(id);
      const barnardFetchedAt = sourceFetchedAt['barnard-hours'];
      const barnardAge = isBarnard ? now.getTime() - Date.parse(barnardFetchedAt) : 0;
      const isPartial = isBarnard && days.some(day => day.sourceId !== 'barnard-hours');
      const isExpired = isBarnard && barnardAge > 24 * 60 * 60 * 1000;
      const isBarnardStale = isBarnard && barnardAge > 8 * 60 * 60 * 1000;
      const isAllWeekClosed = isBarnard && !isPartial && days.every(day => (
        day.status === 'Closed' && day.intervals.length === 0
      ));
      const diningLive = !isBarnard || (!isPartial && !isExpired);
      if (isBarnardStale) barnardStale = true;
      if (!diningLive) dynamicFallbackIds.push(id);
      let sourceNote = todayStatus && !/^closed\b/i.test(todayStatus) ? todayStatus : null;
      if (isExpired) {
        sourceNote = `Barnard hours may be outdated · Last confirmed ${formatEastern(barnardFetchedAt)}`;
      } else if (isPartial) {
        sourceNote = 'Some Barnard hours are not yet published';
      } else if (isBarnardStale) {
        sourceNote = `Barnard hours last confirmed ${formatEastern(barnardFetchedAt)} · Verify before visiting`;
      } else if (isAllWeekClosed) {
        sourceNote = 'Closed throughout the published week';
      }
      entries.push([venue, {
        hours,
        sourceStatuses,
        sourceIds,
        sourceNote,
        diningLive,
        diningFreshness: isExpired ? 'expired'
          : isPartial ? 'partial' : isBarnardStale ? 'stale' : 'live',
      }]);
    }
    const baseFallbackIds = snapshot.schemaVersion === 4 ? STATIC_FALLBACK_IDS
      : snapshot.schemaVersion === 3 ? V3_STATIC_FALLBACK_IDS : LEGACY_STATIC_FALLBACK_IDS;
    const staticFallbackIds = [...baseFallbackIds, ...dynamicFallbackIds];
    const updatedCount = entries.filter(([, next]) => next.diningLive).length;
    const totalCount = new Set([...entries.map(([venue]) => venue.id), ...staticFallbackIds]).size;
    return {
      ok: true,
      entries,
      staticFallbackIds,
      specialServices,
      updatedCount,
      totalCount,
      barnardFetchedAt: sourceFetchedAt['barnard-hours'] || null,
      barnardStale,
    };
  }

  function validateIndependentBarnardSnapshot(snapshot) {
    if (!exactKeys(snapshot, [
      'schemaVersion', 'generated', 'source', 'windowStart', 'windowEnd', 'venues',
    ]) || snapshot.schemaVersion !== 1 || snapshot.source !== SOURCE_CONTRACT['barnard-hours']
      || typeof snapshot.generated !== 'string' || Number.isNaN(Date.parse(snapshot.generated))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.generated)
      || !ISO_DATE.test(snapshot.windowStart || '')
      || ![addDays(snapshot.windowStart, 13), addDays(snapshot.windowStart, 20)].includes(snapshot.windowEnd)
      || new Date(`${snapshot.windowStart}T12:00:00Z`).getUTCDay() !== 0
      || !Array.isArray(snapshot.venues) || snapshot.venues.length !== BARNARD_IDS.length) return null;
    const dayCount = snapshot.windowEnd === addDays(snapshot.windowStart, 13) ? 14 : 21;
    const byId = new Map();
    for (let venueIndex = 0; venueIndex < BARNARD_IDS.length; venueIndex += 1) {
      const venue = snapshot.venues[venueIndex];
      const id = BARNARD_IDS[venueIndex];
      const contract = CONTRACT[id];
      if (!exactKeys(venue, ['id', 'name', 'category', 'days']) || venue.id !== id
        || venue.category !== contract.category || !validText(venue.name, 120)
        || !Array.isArray(venue.days) || venue.days.length !== dayCount) return null;
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
        const day = venue.days[dayIndex];
        if (!exactKeys(day, ['date', 'intervals', 'status'])
          || day.date !== addDays(snapshot.windowStart, dayIndex)
          || !validIntervals(day.intervals) || ![null, 'Closed'].includes(day.status)
          || (day.status === 'Closed' && day.intervals.length)
          || (day.status === null && !day.intervals.length)) return null;
      }
      byId.set(id, venue);
    }
    return byId;
  }

  function buildIndependentBarnardUpdates(snapshot, venues, today, now = new Date()) {
    const byId = validateIndependentBarnardSnapshot(snapshot);
    if (!byId || !ISO_DATE.test(today || '')) return { ok: false };
    const firstIndex = Math.round((
      new Date(`${today}T12:00:00Z`) - new Date(`${snapshot.windowStart}T12:00:00Z`)
    ) / 86400000);
    if (firstIndex < 0 || firstIndex + 7 > byId.get(BARNARD_IDS[0]).days.length) return { ok: false };

    const age = now.getTime() - Date.parse(snapshot.generated);
    const expired = age > 24 * 60 * 60 * 1000;
    const stale = age > 8 * 60 * 60 * 1000;
    const entries = [];
    for (const id of BARNARD_IDS) {
      const venue = venues.find(item => item.id === id);
      if (!venue) continue;
      const days = byId.get(id).days.slice(firstIndex, firstIndex + 7);
      const hours = {};
      const sourceStatuses = {};
      const sourceIds = {};
      for (const day of days) {
        const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        hours[dow] = day.intervals.map(interval => [interval[0], interval[1]]);
        sourceStatuses[dow] = day.status;
        sourceIds[dow] = 'barnard-hours';
      }
      const allWeekClosed = days.every(day => day.status === 'Closed' && !day.intervals.length);
      const sourceNote = expired
        ? `Barnard hours may be outdated · Last confirmed ${formatEastern(snapshot.generated)}`
        : stale
          ? `Barnard hours last confirmed ${formatEastern(snapshot.generated)} · Verify before visiting`
          : allWeekClosed ? 'Closed throughout the published week' : null;
      entries.push([venue, {
        hours,
        sourceStatuses,
        sourceIds,
        sourceNote,
        diningLive: !expired,
        diningFreshness: expired ? 'expired' : stale ? 'stale' : 'live',
      }]);
    }
    return {
      ok: true,
      entries,
      fetchedAt: snapshot.generated,
      stale,
      expired,
    };
  }

  function mergeIndependentBarnard(updates, barnard) {
    if (!barnard.ok) return updates;
    const entries = [
      ...updates.entries.filter(([venue]) => !BARNARD_IDS.includes(venue.id)),
      ...barnard.entries,
    ];
    const staticFallbackIds = updates.staticFallbackIds.filter(id => !BARNARD_IDS.includes(id));
    if (barnard.expired) staticFallbackIds.push(...BARNARD_IDS);
    return {
      ...updates,
      entries,
      staticFallbackIds,
      updatedCount: entries.filter(([, next]) => next.diningLive).length,
      totalCount: new Set([...entries.map(([venue]) => venue.id), ...staticFallbackIds]).size,
      barnardFetchedAt: barnard.fetchedAt,
      barnardStale: barnard.stale,
    };
  }

  function embeddedDiningUpdates(venues) {
    const knownIds = new Set([...Object.keys(CONTRACT), ...STATIC_FALLBACK_IDS]);
    const staticFallbackIds = venues
      .map(({ id }) => id)
      .filter(id => knownIds.has(id) && !BARNARD_IDS.includes(id));
    return {
      ok: true,
      entries: [],
      staticFallbackIds,
      specialServices: [],
      updatedCount: 0,
      totalCount: staticFallbackIds.length + BARNARD_IDS.length,
      barnardFetchedAt: null,
      barnardStale: false,
    };
  }

  async function hydrate({
    venues,
    fetchImpl = global.fetch,
    barnardFetchImpl = fetchImpl,
    render,
    setStatus = () => {},
    setSpecialServices = () => {},
    today,
    now = new Date(),
  }) {
    try {
      let snapshot = null;
      let updates = null;
      let combinedError = null;
      try {
        const response = await fetchImpl('/api/dining-hours', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`http-${response.status}`);
        snapshot = await response.json();
        updates = buildUpdates(snapshot, venues, today, now);
        if (!updates.ok) throw new Error('invalid-data');
      } catch (error) {
        combinedError = error;
        snapshot = null;
        updates = embeddedDiningUpdates(venues);
      }
      if (!updates.barnardFetchedAt) {
        try {
          const barnardResponse = await barnardFetchImpl('/api/barnard-dining-hours', {
            headers: { Accept: 'application/json' },
          });
          if (barnardResponse.ok) {
            const barnard = buildIndependentBarnardUpdates(
              await barnardResponse.json(), venues, today, now,
            );
            updates = mergeIndependentBarnard(updates, barnard);
          }
        } catch {}
      }
      if (!snapshot && !updates.barnardFetchedAt) throw combinedError || new Error('network-error');
      setSpecialServices(updates.specialServices);
      for (const [venue, next] of updates.entries) Object.assign(venue, next);
      render();
      const generated = snapshot?.generated || updates.barnardFetchedAt;
      const stale = (snapshot
        ? now.getTime() - Date.parse(snapshot.generated) > 8 * 60 * 60 * 1000
        : false)
        || updates.barnardStale;
      const status = {
        kind: stale ? 'stale' : 'partial',
        generated,
        updatedCount: updates.updatedCount,
        totalCount: updates.totalCount,
        staticFallbackIds: updates.staticFallbackIds,
        barnardFetchedAt: updates.barnardFetchedAt,
      };
      setStatus(status);
      return { applied: true, stale, ...status };
    } catch (error) {
      setStatus({ kind: 'fallback' });
      return { applied: false, reason: error?.message || 'network-error' };
    }
  }

  global.LionHourDiningHours = { buildUpdates, buildIndependentBarnardUpdates, hydrate };
})(globalThis);
