import { timingSafeEqual } from 'node:crypto';

import { validateRecreationHoursSnapshot } from './recreation-hours-schema.js';

function secretsMatch(authorization, expectedSecret) {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedSecret || '');
  return actualBytes.length > 0
    && actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

export function createRecreationHoursService({ store, updateSecret, logger = console }) {
  return {
    async handle(request) {
      try {
        if (request.method === 'GET') {
          const snapshot = await store.getSnapshot();
          return snapshot
            ? {
                status: 200,
                headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
                body: snapshot,
              }
            : {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
                body: { error: 'Recreation hours are not initialized' },
              };
        }
        if (request.method !== 'PUT') {
          return { status: 405, headers: { Allow: 'GET, PUT' }, body: { error: 'Method not allowed' } };
        }
        if (!secretsMatch(request.authorization, updateSecret)) {
          return { status: 401, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Unauthorized' } };
        }
        const validation = validateRecreationHoursSnapshot(request.body);
        if (!validation.ok) {
          return {
            status: 422,
            headers: { 'Cache-Control': 'no-store' },
            body: { error: 'Invalid snapshot', details: validation.errors },
          };
        }
        await store.putSnapshot(validation.value);
        return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null };
      } catch (error) {
        logger.error('Recreation hours storage operation failed', { name: error?.name });
        return { status: 500, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Internal server error' } };
      }
    },
  };
}
