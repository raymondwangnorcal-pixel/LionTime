import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryHoursService } from '../lib/library-hours-service.js';
import { makeValidSnapshot } from './helpers/library-hours-fixture.mjs';

function createMemoryStore(initial = null, fail = false) {
  let snapshot = initial;
  return {
    async getSnapshot() { if (fail) throw new Error('storage detail'); return snapshot; },
    async putSnapshot(next) { if (fail) throw new Error('storage detail'); snapshot = structuredClone(next); },
    inspect() { return snapshot; },
  };
}

test('returns the current snapshot with public cache headers', async () => {
  const snapshot = makeValidSnapshot();
  const service = createLibraryHoursService({ store: createMemoryStore(snapshot), updateSecret: 'test-secret' });
  const response = await service.handle({ method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  assert.deepEqual(response.body, snapshot);
});

test('valid uploads replace the snapshot and invalid uploads preserve it', async () => {
  const existing = makeValidSnapshot();
  const store = createMemoryStore(existing);
  const service = createLibraryHoursService({ store, updateSecret: 'test-secret' });
  const invalid = await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: { schemaVersion: 1, libraries: [] } });
  assert.equal(invalid.status, 422);
  assert.deepEqual(store.inspect(), existing);
  const next = makeValidSnapshot();
  next.generated = '2026-08-20T16:00:00-04:00';
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: next })).status, 204);
  assert.deepEqual(store.inspect(), next);
});

test('protects writes and handles empty, unsupported, and failed storage', async () => {
  const service = createLibraryHoursService({ store: createMemoryStore(), updateSecret: 'test-secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer wrong', body: makeValidSnapshot() })).status, 401);
  const failed = createLibraryHoursService({ store: createMemoryStore(null, true), updateSecret: 'test-secret', logger: { error() {} } });
  const response = await failed.handle({ method: 'GET' });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Internal server error' });
});
