import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiningMenusService } from '../lib/dining-menus-service.js';

function makeValidSnapshot() {
  return {
    schemaVersion: 1,
    date: '2026-09-20',
    generated: '2026-09-20T07:25:08.489489-04:00',
    source: 'liondine.com',
    venues: { ferris: { meals: { lunch: { name: 'Ferris', available: true, stations: [] } } } },
    unavailable: [],
  };
}

function createMemoryStore(initial = null, fail = false) {
  let snapshot = initial;
  return {
    async getSnapshot() { if (fail) throw new Error('storage detail'); return snapshot; },
    async putSnapshot(next) { if (fail) throw new Error('storage detail'); snapshot = structuredClone(next); },
    inspect() { return snapshot; },
  };
}

test('serves the current menus with public cache headers', async () => {
  const snapshot = makeValidSnapshot();
  const service = createDiningMenusService({ store: createMemoryStore(snapshot), updateSecret: 'test-secret' });
  const response = await service.handle({ method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  assert.deepEqual(response.body, snapshot);
});

test('a valid upload replaces the menus and an invalid one preserves them', async () => {
  const existing = makeValidSnapshot();
  const store = createMemoryStore(existing);
  const service = createDiningMenusService({ store, updateSecret: 'test-secret' });

  const invalid = await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: { schemaVersion: 1, venues: {} } });
  assert.equal(invalid.status, 422);
  assert.deepEqual(store.inspect(), existing);

  const next = makeValidSnapshot();
  next.generated = '2026-09-20T13:25:00.000000-04:00';
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: next })).status, 204);
  assert.deepEqual(store.inspect(), next);
});

test('protects writes and handles empty, unsupported, and failed storage', async () => {
  const service = createDiningMenusService({ store: createMemoryStore(), updateSecret: 'test-secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer wrong', body: makeValidSnapshot() })).status, 401);
  assert.equal((await service.handle({ method: 'PUT', body: makeValidSnapshot() })).status, 401);

  const failed = createDiningMenusService({ store: createMemoryStore(null, true), updateSecret: 'test-secret', logger: { error() {} } });
  const response = await failed.handle({ method: 'GET' });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Internal server error' });
});
