import { validateBarnardDiningHoursSnapshot } from './barnard-dining-hours-schema.js';
import { validateDiningSourceState } from './dining-hours-source-schema.js';

function projectBarnardSnapshot(stored) {
  if (stored?.kind !== 'dining-source-state') return null;
  const validation = validateDiningSourceState(stored);
  if (!validation.ok) throw new Error('invalid stored Dining hours state');
  const source = stored.sources.find(({ sourceId }) => sourceId === 'barnard-hours');
  if (!source?.lastSuccessAt || !source.payload) return null;
  return {
    schemaVersion: 1,
    generated: source.lastSuccessAt,
    source: source.sourceUrl,
    windowStart: source.payload.windowStart,
    windowEnd: source.payload.windowEnd,
    venues: structuredClone(source.payload.venues),
  };
}

export function createBarnardDiningHoursService({ store, logger = console }) {
  return {
    async handle(request) {
      try {
        if (request.method !== 'GET') {
          return { status: 405, headers: { Allow: 'GET' }, body: { error: 'Method not allowed' } };
        }
        const snapshot = projectBarnardSnapshot(await store.getSnapshot());
        if (!snapshot) {
          return {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
            body: { error: 'Barnard Dining hours are not initialized' },
          };
        }
        const validation = validateBarnardDiningHoursSnapshot(snapshot);
        if (!validation.ok) throw new Error('invalid Barnard Dining projection');
        return {
          status: 200,
          headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
          body: validation.value,
        };
      } catch (error) {
        logger.error('Barnard Dining hours storage operation failed', { name: error?.name });
        return {
          status: 500,
          headers: { 'Cache-Control': 'no-store' },
          body: { error: 'Internal server error' },
        };
      }
    },
  };
}
