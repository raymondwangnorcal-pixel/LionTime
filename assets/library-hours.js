(function exposeLibraryHours(global) {
  const ID_MAP = Object.freeze({
    butler_24: 'butler',
    science_engineering: 'noco',
    lehman: 'lehman',
    business: 'uris',
    avery: 'avery',
    math: 'math',
  });
  const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
  const FALLBACK_REASON = 'unapproved-overnight-hours';

  function buildUpdates(snapshot, venues, today) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.libraries)
      || typeof snapshot.generated !== 'string' || Number.isNaN(Date.parse(snapshot.generated))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.generated)) {
      return { ok: false };
    }
    const expectedIds = Object.keys(ID_MAP);
    const byId = new Map();
    for (const library of snapshot.libraries) {
      if (!library || typeof library.id !== 'string' || byId.has(library.id)) return { ok: false };
      byId.set(library.id, library);
    }
    if (byId.size !== expectedIds.length || expectedIds.some((id) => !byId.has(id))) return { ok: false };

    const entries = [];
    const fallbackIds = [];
    for (const scraperId of expectedIds) {
      const library = byId.get(scraperId);
      if (library.scrapeFailed || typeof library.temporarilyClosed !== 'boolean'
        || !Array.isArray(library.schedules)
        || !/^https:\/\/hours\.library\.columbia\.edu\/locations\/[^/?#]+(?:\?.*)?$/.test(library.url || '')) {
        return { ok: false };
      }
      const venue = venues.find((item) => item.id === ID_MAP[scraperId]);
      if (!venue) return { ok: false };
      if (library.useEmbeddedFallback === true) {
        if (scraperId !== 'lehman' || library.fallbackReason !== FALLBACK_REASON
          || library.temporarilyClosed !== false || library.schedules.length !== 0) {
          return { ok: false };
        }
        fallbackIds.push(scraperId);
        continue;
      }
      if (library.useEmbeddedFallback !== undefined && library.useEmbeddedFallback !== false) {
        return { ok: false };
      }
      if (library.fallbackReason !== undefined) return { ok: false };
      const schedule = library.schedules.find((item) => item && item.start <= today && today <= item.end);
      if (!schedule || !venue || !schedule.hours || Object.keys(schedule.hours).length !== 7) {
        return { ok: false };
      }
      const hours = {};
      for (let day = 0; day < 7; day += 1) {
        const interval = schedule.hours[String(day)];
        if (interval === null) {
          hours[day] = null;
        } else if (interval && OPEN_TIME.test(interval.open || '') && CLOSE_TIME.test(interval.close || '')
          && (scraperId === 'butler_24' || interval.close > interval.open)) {
          hours[day] = [[interval.open, interval.close]];
        } else {
          return { ok: false };
        }
      }
      if (library.temporarilyClosed && Object.values(hours).some(Boolean)) return { ok: false };
      const next = { hours };
      if (typeof library.note === 'string' && library.note.trim()) next.note = library.note.trim();
      entries.push([venue, next]);
    }
    return { ok: true, entries, fallbackIds };
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
      const response = await fetchImpl('/api/library-hours', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const snapshot = await response.json();
      const updates = buildUpdates(snapshot, venues, today);
      if (!updates.ok) throw new Error('invalid-data');
      for (const [venue, next] of updates.entries) Object.assign(venue, next);
      render();
      const ageMilliseconds = now.getTime() - Date.parse(snapshot.generated);
      const stale = ageMilliseconds > 8 * 60 * 60 * 1000;
      const kind = stale ? 'stale' : updates.fallbackIds.length ? 'partial' : 'live';
      const status = {
        kind,
        generated: snapshot.generated,
        generatedDisplay: snapshot.generatedDisplay,
        updatedCount: updates.entries.length,
        totalCount: Object.keys(ID_MAP).length,
        fallbackIds: updates.fallbackIds,
      };
      setStatus(status);
      return { applied: true, generated: snapshot.generated, stale, ...status };
    } catch (error) {
      setStatus({ kind: 'fallback' });
      return { applied: false, reason: error?.message || 'network-error' };
    }
  }

  global.LionHourLibraryHours = { buildUpdates, hydrate };
})(globalThis);
