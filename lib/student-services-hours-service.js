import { timingSafeEqual } from 'node:crypto';

import { STUDENT_SERVICES_SOURCE_IDS, STUDENT_SERVICES_SOURCE_URLS } from './student-services-hours-catalog.js';
import { validateStudentServicesAttemptBatch, validateStudentServicesSnapshot } from './student-services-hours-schema.js';

function secretsMatch(authorization, expectedSecret) {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedSecret || '');
  return actualBytes.length > 0 && actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function mergeBatch(previous, batch) {
  const previousById = new Map((previous?.sources || []).map(source => [source.sourceId, source]));
  const attempts = new Map(batch.attempts.map(attempt => [attempt.sourceId, attempt]));
  return {
    schemaVersion: 1,
    generated: batch.generated,
    windowStart: batch.windowStart,
    windowEnd: batch.windowEnd,
    sources: STUDENT_SERVICES_SOURCE_IDS.map(sourceId => {
      const attempt = attempts.get(sourceId);
      const prior = previousById.get(sourceId);
      if (attempt.result === 'success') return {
        sourceId,
        sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId],
        lastAttemptAt: attempt.attemptedAt,
        lastAttemptResult: 'success',
        failureCode: null,
        lastSuccessAt: attempt.attemptedAt,
        venues: structuredClone(attempt.venues),
      };
      return {
        sourceId,
        sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId],
        lastAttemptAt: attempt.attemptedAt,
        lastAttemptResult: 'failure',
        failureCode: attempt.failureCode,
        lastSuccessAt: prior?.lastSuccessAt || null,
        venues: structuredClone(prior?.venues || []),
      };
    }),
  };
}

export function createStudentServicesHoursService({ store, updateSecret, logger = console }) {
  return {
    async handle(request) {
      try {
        if (request.method === 'GET') {
          const snapshot = await store.getSnapshot();
          const initialized = snapshot?.sources?.some(source => source.lastSuccessAt !== null);
          return initialized
            ? { status: 200, headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' }, body: snapshot }
            : { status: 503, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Student services hours are not initialized' } };
        }
        if (request.method !== 'PUT') return { status: 405, headers: { Allow: 'GET, PUT' }, body: { error: 'Method not allowed' } };
        if (!secretsMatch(request.authorization, updateSecret)) return { status: 401, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Unauthorized' } };
        const batchValidation = validateStudentServicesAttemptBatch(request.body);
        if (!batchValidation.ok) return { status: 422, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Invalid attempt batch', details: batchValidation.errors } };
        const previous = await store.getSnapshot();
        const merged = mergeBatch(previous, batchValidation.value);
        const snapshotValidation = validateStudentServicesSnapshot(merged);
        if (!snapshotValidation.ok) return { status: 422, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Invalid merged snapshot', details: snapshotValidation.errors } };
        await store.putSnapshot(snapshotValidation.value);
        return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null };
      } catch (error) {
        logger.error('Student services hours storage operation failed', { name: error?.name });
        return { status: 500, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Internal server error' } };
      }
    },
  };
}
