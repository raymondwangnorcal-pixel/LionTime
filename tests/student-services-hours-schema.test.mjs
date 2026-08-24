import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStudentServicesAttemptBatch, validateStudentServicesSnapshot } from '../lib/student-services-hours-schema.js';
import { createStudentServicesHoursService } from '../lib/student-services-hours-service.js';
import { makeStudentServicesAttemptBatch } from './helpers/student-services-hours-fixture.mjs';

test('accepts a complete four-source attempt batch with office-hours context', () => {
  assert.equal(validateStudentServicesAttemptBatch(makeStudentServicesAttemptBatch()).ok, true);
});

test('rejects missing owned venues, wrong sources, unknown fields, and cross-midnight intervals', () => {
  for (const mutate of [
    batch => batch.attempts[1].venues.pop(),
    batch => { batch.attempts[0].sourceUrl = 'https://example.com'; },
    batch => { batch.attempts[0].unsafe = true; },
    batch => { batch.attempts[0].venues[0].days[0].availabilities[0].intervals = [['20:00', '02:00']]; },
  ]) {
    const batch = makeStudentServicesAttemptBatch(); mutate(batch);
    assert.equal(validateStudentServicesAttemptBatch(batch).ok, false);
  }
});

test('accepts the source-isolated stored snapshot produced by the service', async () => {
  let snapshot = null;
  const service = createStudentServicesHoursService({ store: { getSnapshot: async () => snapshot, putSnapshot: async value => { snapshot = value; } }, updateSecret: 'secret' });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: makeStudentServicesAttemptBatch() })).status, 204);
  assert.equal(validateStudentServicesSnapshot(snapshot).ok, true);
});
