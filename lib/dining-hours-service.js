import { timingSafeEqual } from 'node:crypto';

import { resolveDiningSnapshot } from './dining-hours-resolver.js';
import { DINING_SOURCE_CONTRACT, validateDiningHoursSnapshot } from './dining-hours-schema.js';
import {
  DINING_SOURCE_IDS,
  validateDiningAttemptBatch,
  validateDiningSourceState,
} from './dining-hours-source-schema.js';

function secretsMatch(authorization, expectedSecret) {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedSecret || '');
  return actualBytes.length > 0
    && actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function isSourceState(value) {
  return value?.kind === 'dining-source-state';
}

function publicSnapshot(stored) {
  return isSourceState(stored) ? stored.snapshot : stored;
}

function mergeSourceState(previous, batch) {
  const previousSources = isSourceState(previous) ? previous.sources : [];
  const previousById = new Map(previousSources.map(source => [source.sourceId, source]));
  const attemptById = new Map(batch.attempts.map(attempt => [attempt.sourceId, attempt]));
  const sources = DINING_SOURCE_IDS.map(sourceId => {
    const attempt = attemptById.get(sourceId);
    const prior = previousById.get(sourceId);
    if (attempt.result === 'success') {
      return {
        sourceId,
        sourceUrl: DINING_SOURCE_CONTRACT[sourceId],
        lastAttemptAt: attempt.attemptedAt,
        lastAttemptResult: 'success',
        failureCode: null,
        lastSuccessAt: attempt.attemptedAt,
        payload: structuredClone(attempt.payload),
      };
    }
    return {
      sourceId,
      sourceUrl: DINING_SOURCE_CONTRACT[sourceId],
      lastAttemptAt: attempt.attemptedAt,
      lastAttemptResult: 'failure',
      failureCode: attempt.failureCode,
      lastSuccessAt: prior?.lastSuccessAt || null,
      payload: structuredClone(prior?.payload || null),
    };
  });

  let snapshot = publicSnapshot(previous) || null;
  if (sources.every(source => source.payload !== null)) {
    const payloadById = new Map(sources.map(source => [source.sourceId, source.payload]));
    snapshot = resolveDiningSnapshot({
      baseSnapshot: payloadById.get('locations-feed'),
      nsop: payloadById.get('nsop-2026'),
      labor: payloadById.get('labor-day-2026'),
      fall: payloadById.get('fall-2026'),
    });
  }
  return {
    kind: 'dining-source-state',
    schemaVersion: 1,
    generated: batch.generated,
    sources,
    snapshot,
  };
}

export function createDiningHoursService({ store, updateSecret, logger = console }) {
  return {
    async handle(request) {
      try {
        if (request.method === 'GET') {
          const stored = await store.getSnapshot();
          const storedValidation = isSourceState(stored)
            ? validateDiningSourceState(stored)
            : stored === null || stored === undefined
              ? { ok: true }
              : validateDiningHoursSnapshot(stored);
          if (!storedValidation.ok) throw new Error('invalid stored Dining hours state');
          const snapshot = publicSnapshot(stored);
          return snapshot
            ? {
                status: 200,
                headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
                body: snapshot,
              }
            : {
                status: 503,
                headers: { 'Cache-Control': 'no-store' },
                body: { error: 'Dining hours are not initialized' },
              };
        }
        if (request.method !== 'PUT') {
          return { status: 405, headers: { Allow: 'GET, PUT' }, body: { error: 'Method not allowed' } };
        }
        if (!secretsMatch(request.authorization, updateSecret)) {
          return { status: 401, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Unauthorized' } };
        }
        const batchValidation = validateDiningAttemptBatch(request.body);
        if (!batchValidation.ok) {
          return {
            status: 422,
            headers: { 'Cache-Control': 'no-store' },
            body: { error: 'Invalid attempt batch', details: batchValidation.errors },
          };
        }
        const previous = await store.getSnapshot();
        if (previous !== null && previous !== undefined) {
          const previousValidation = isSourceState(previous)
            ? validateDiningSourceState(previous)
            : validateDiningHoursSnapshot(previous);
          if (!previousValidation.ok) throw new Error('invalid stored Dining hours state');
        }
        const merged = mergeSourceState(previous, batchValidation.value);
        const stateValidation = validateDiningSourceState(merged);
        if (!stateValidation.ok) {
          return {
            status: 422,
            headers: { 'Cache-Control': 'no-store' },
            body: { error: 'Invalid merged source state', details: stateValidation.errors },
          };
        }
        await store.putSnapshot(stateValidation.value);
        return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null };
      } catch (error) {
        logger.error('Dining hours storage operation failed', { name: error?.name });
        return { status: 500, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Internal server error' } };
      }
    },
  };
}
