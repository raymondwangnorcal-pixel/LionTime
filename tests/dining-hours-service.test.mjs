import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiningHoursService } from '../lib/dining-hours-service.js';
import { makeValidDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

function memoryStore(initial = null) {
  let snapshot = initial;
  return {
    async getSnapshot() { return snapshot; },
    async putSnapshot(next) { snapshot = next; },
  };
}

test('returns the current dining snapshot with public cache headers', async () => {
  const snapshot = makeValidDiningSnapshot();
  const service = createDiningHoursService({ store: memoryStore(snapshot), updateSecret: 'secret' });
  const response = await service.handle({ method: 'GET' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, snapshot);
  assert.match(response.headers['Cache-Control'], /s-maxage=300/);
});

test('valid uploads replace the snapshot and invalid uploads preserve it', async () => {
  const original = makeValidDiningSnapshot();
  const store = memoryStore(original);
  const service = createDiningHoursService({ store, updateSecret: 'test-secret' });
  const invalid = structuredClone(original);
  invalid.locations.pop();
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: invalid,
  })).status, 422);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, original);

  const next = makeValidDiningSnapshot();
  next.generated = '2026-08-21T16:00:00.000Z';
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: next,
  })).status, 204);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, next);
});

test('protects writes and handles empty, unsupported, and failed storage', async () => {
  const service = createDiningHoursService({ store: memoryStore(), updateSecret: 'test-secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer wrong', body: makeValidDiningSnapshot(),
  })).status, 401);

  const errors = [];
  const failing = createDiningHoursService({
    store: { async getSnapshot() { throw new Error('redis down'); } },
    updateSecret: 'secret',
    logger: { error(message, context) { errors.push([message, context]); } },
  });
  const response = await failing.handle({ method: 'GET' });
  assert.equal(response.status, 500);
  assert.deepEqual(errors[0][1], { name: 'Error' });
});
