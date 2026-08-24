import assert from 'node:assert/strict';
import test from 'node:test';

import { createStudentServicesHoursService } from '../lib/student-services-hours-service.js';
import { makeStudentServicesAttemptBatch } from './helpers/student-services-hours-fixture.mjs';

function setup() {
  let snapshot = null; let writes = 0;
  const store = { getSnapshot: async () => snapshot, putSnapshot: async value => { snapshot = structuredClone(value); writes += 1; } };
  return { service: createStudentServicesHoursService({ store, updateSecret: 'secret', logger: { error() {} } }),
    get snapshot() { return snapshot; }, get writes() { return writes; } };
}

test('returns 503 until one source initializes and supports exact methods', async () => {
  const state = setup();
  assert.equal((await state.service.handle({ method: 'GET' })).status, 503);
  assert.equal((await state.service.handle({ method: 'POST' })).status, 405);
  assert.equal((await state.service.handle({ method: 'PUT', authorization: 'bad', body: {} })).status, 401);
});

test('stores a first partial batch and retains last success on a later source failure', async () => {
  const state = setup();
  const first = makeStudentServicesAttemptBatch({ failed: ['bookstore'] });
  assert.equal((await state.service.handle({ method: 'PUT', authorization: 'Bearer secret', body: first })).status, 204);
  assert.equal(state.snapshot.sources[0].lastSuccessAt, null);
  const priorHealth = structuredClone(state.snapshot.sources[1].venues);
  const second = makeStudentServicesAttemptBatch({ failed: ['health'] });
  second.generated = '2026-08-23T16:00:00-04:00';
  second.attempts.forEach(attempt => { attempt.attemptedAt = second.generated; });
  assert.equal((await state.service.handle({ method: 'PUT', authorization: 'Bearer secret', body: second })).status, 204);
  assert.deepEqual(state.snapshot.sources[1].venues, priorHealth);
  assert.equal(state.snapshot.sources[1].lastAttemptResult, 'failure');
});

test('rejects malformed input without replacing storage', async () => {
  const state = setup();
  await state.service.handle({ method: 'PUT', authorization: 'Bearer secret', body: makeStudentServicesAttemptBatch() });
  const before = structuredClone(state.snapshot);
  const bad = makeStudentServicesAttemptBatch(); bad.attempts[0].venues = [];
  assert.equal((await state.service.handle({ method: 'PUT', authorization: 'Bearer secret', body: bad })).status, 422);
  assert.deepEqual(state.snapshot, before);
  assert.equal(state.writes, 1);
});
