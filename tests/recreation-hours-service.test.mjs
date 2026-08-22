import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecreationHoursService } from '../lib/recreation-hours-service.js';
import { nextSnapshot, setDay, validSnapshot } from './helpers/recreation-hours-fixture.mjs';

function memoryStore(initial = null) {
  let snapshot = initial;
  return {
    async getSnapshot() { return snapshot; },
    async putSnapshot(next) { snapshot = next; },
  };
}

test('GET returns an uninitialized response until a snapshot exists', async () => {
  const service = createRecreationHoursService({ store: memoryStore(null), updateSecret: 'secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
});

test('authenticated valid PUT replaces the snapshot and invalid PUT preserves it', async () => {
  const store = memoryStore(validSnapshot());
  const service = createRecreationHoursService({ store, updateSecret: 'secret' });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer secret', body: nextSnapshot(),
  })).status, 204);
  const preserved = await store.getSnapshot();
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: {} })).status, 422);
  assert.deepEqual(await store.getSnapshot(), preserved);
});

test('uses public cache headers for reads and rejects unauthenticated or unsupported writes', async () => {
  const service = createRecreationHoursService({ store: memoryStore(validSnapshot()), updateSecret: 'secret' });
  const get = await service.handle({ method: 'GET' });
  assert.equal(get.status, 200);
  assert.match(get.headers['Cache-Control'], /s-maxage=300/);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer nope', body: validSnapshot() })).status, 401);
});

test('returns 422 and preserves the snapshot for malformed child intervals', async () => {
  const original = validSnapshot();
  const store = memoryStore(original);
  const service = createRecreationHoursService({ store, updateSecret: 'secret' });
  const malformed = setDay(validSnapshot(), 'uris-pool', { intervals: [null] });
  const response = await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: malformed });
  assert.equal(response.status, 422);
  assert.deepEqual(await store.getSnapshot(), original);
});
