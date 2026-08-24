import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiningHoursService } from '../lib/dining-hours-service.js';
import {
  makeValidDiningAttemptBatch,
  makeValidDiningSnapshot,
  makeValidDiningSnapshotV2,
} from './helpers/dining-hours-fixture.mjs';

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
  const invalid = makeValidDiningAttemptBatch();
  invalid.attempts[0].payload.locations.pop();
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: invalid,
  })).status, 422);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, original);

  const batch = makeValidDiningAttemptBatch();
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: batch,
  })).status, 204);
  const next = (await service.handle({ method: 'GET' })).body;
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.generated, batch.generated);
  assert.equal(next.sources.length, 4);
});

test('retains each source independently and keeps the legacy snapshot until all payloads initialize', async () => {
  const legacy = makeValidDiningSnapshotV2();
  const store = memoryStore(legacy);
  const service = createDiningHoursService({ store, updateSecret: 'test-secret' });

  const first = makeValidDiningAttemptBatch({ failures: ['labor-day-2026', 'fall-2026'] });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: first,
  })).status, 204);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, legacy);

  const second = makeValidDiningAttemptBatch({
    generated: '2026-08-21T16:00:00.000Z',
    failures: ['locations-feed', 'nsop-2026'],
  });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: second,
  })).status, 204);
  const resolved = (await service.handle({ method: 'GET' })).body;
  assert.equal(resolved.generated, first.generated);
  assert.equal(resolved.schemaVersion, 2);

  const stored = await store.getSnapshot();
  assert.equal(stored.kind, 'dining-source-state');
  assert.deepEqual(stored.sources.map(source => [
    source.sourceId, source.lastAttemptResult, source.lastSuccessAt,
  ]), [
    ['locations-feed', 'failure', first.generated],
    ['nsop-2026', 'failure', first.generated],
    ['labor-day-2026', 'success', second.generated],
    ['fall-2026', 'success', second.generated],
  ]);
});

test('protects writes and handles empty, unsupported, and failed storage', async () => {
  const service = createDiningHoursService({ store: memoryStore(), updateSecret: 'test-secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer wrong', body: makeValidDiningAttemptBatch(),
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
