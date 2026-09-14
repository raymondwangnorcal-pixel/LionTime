/**
 * preview-service.js — the read model behind GET /api/preview.
 *
 * Serves the generated baseline summary (categories, venues, weekly hours)
 * with the live library snapshot laid over it where one is available. Status
 * is deliberately NOT computed here: the consumer compares schedules against
 * its own clock, so a CDN-cached response still ticks and still flips
 * open/closed at the right minute.
 *
 * Every source is best-effort. If the store is unreachable the baseline still
 * ships, with `live: false` on the categories that did not get an overlay, so
 * a caller can say "showing published hours" instead of showing nothing.
 */
import { PREVIEW_SUMMARY } from './preview-summary.generated.mjs';
import { SCRAPER_TO_VENUE_ID } from './library-hours-schema.js';

const CACHE_HEADERS = Object.freeze({
  'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

function easternDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PREVIEW_SUMMARY.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** {"0": {open, close} | null} → {"0": [["09:00","24:00"]]} — the catalog shape. */
function toIntervals(hours) {
  const out = {};
  for (let day = 0; day < 7; day += 1) {
    const interval = hours?.[String(day)];
    out[String(day)] = interval ? [[interval.open, interval.close]] : [];
  }
  return out;
}

/**
 * Reads the library snapshot into a Map of venue id → weekly intervals.
 * Anything the scraper flagged (failed, temporarily closed, or told to fall
 * back to the embedded schedule) is left alone so the baseline shows through —
 * the same precedence the site itself uses.
 */
export function libraryOverlay(snapshot, today) {
  const overlay = new Map();
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.libraries)) return overlay;

  for (const library of snapshot.libraries) {
    const venueId = SCRAPER_TO_VENUE_ID[library?.id];
    if (!venueId || library.scrapeFailed || library.useEmbeddedFallback) continue;
    if (library.temporarilyClosed) {
      overlay.set(venueId, toIntervals(null));
      continue;
    }
    const schedule = Array.isArray(library.schedules)
      ? library.schedules.find((item) => item && item.start <= today && today <= item.end)
      : null;
    if (!schedule?.hours || Object.keys(schedule.hours).length !== 7) continue;
    overlay.set(venueId, toIntervals(schedule.hours));
  }
  return overlay;
}

export function createPreviewService({ libraryStore, now = () => Date.now(), logger = console } = {}) {
  return {
    async handle(request = {}) {
      if (request.method === 'OPTIONS') return { status: 204, headers: CACHE_HEADERS, body: null };
      if (request.method && request.method !== 'GET') {
        return { status: 405, headers: { Allow: 'GET, OPTIONS' }, body: { error: 'Method not allowed' } };
      }

      const timestamp = now();
      const today = easternDate(timestamp);

      let overlay = new Map();
      try {
        overlay = libraryOverlay(await libraryStore?.getSnapshot(), today);
      } catch (error) {
        logger.error('Preview: library snapshot unavailable', { name: error?.name });
      }

      const categories = PREVIEW_SUMMARY.categories.map((category) => {
        let applied = 0;
        const venues = category.venues.map((venue) => {
          const live = overlay.get(venue.id);
          if (!live) return venue;
          applied += 1;
          // Live hours are published hours, even for a venue with no baseline.
          return { ...venue, published: true, hours: live };
        });
        return { ...category, live: applied > 0, venues };
      });

      return {
        status: 200,
        headers: CACHE_HEADERS,
        body: {
          schemaVersion: PREVIEW_SUMMARY.schemaVersion,
          generated: new Date(timestamp).toISOString(),
          timezone: PREVIEW_SUMMARY.timezone,
          source: PREVIEW_SUMMARY.source,
          categories,
        },
      };
    },
  };
}
