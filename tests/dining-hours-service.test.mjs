import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiningHoursService } from '../lib/dining-hours-service.js';
import {
  makeValidDiningAttemptBatch,
  makeValidDiningSnapshot,
  makeValidDiningSnapshotV2,
  makeValidDiningSnapshotV3,
} from './helpers/dining-hours-fixture.mjs';

function memoryStore(initial = null) {
  let snapshot = initial;
  return {
    async getSnapshot() { return snapshot; },
    async putSnapshot(next) { snapshot = next; },
  };
}

function legacySourceState() {
  const batch = makeValidDiningAttemptBatch();
  return {
    kind: 'dining-source-state',
    schemaVersion: 1,
    generated: batch.generated,
    sources: batch.attempts.slice(0, 4).map((attempt) => ({
      sourceId: attempt.sourceId,
      sourceUrl: attempt.sourceUrl,
      lastAttemptAt: attempt.attemptedAt,
      lastAttemptResult: 'success',
      failureCode: null,
      lastSuccessAt: attempt.attemptedAt,
      payload: structuredClone(attempt.payload),
    })),
    snapshot: makeValidDiningSnapshotV2(),
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
  assert.equal(next.schemaVersion, 3);
  assert.equal(next.generated, batch.generated);
  assert.equal(next.sources.length, 5);
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
  assert.equal(resolved.schemaVersion, 3);

  const stored = await store.getSnapshot();
  assert.equal(stored.kind, 'dining-source-state');
  assert.deepEqual(stored.sources.map(source => [
    source.sourceId, source.lastAttemptResult, source.lastSuccessAt,
  ]), [
    ['locations-feed', 'failure', first.generated],
    ['nsop-2026', 'failure', first.generated],
    ['labor-day-2026', 'success', second.generated],
    ['fall-2026', 'success', second.generated],
    ['cafe-east', 'success', second.generated],
  ]);

  const outage = makeValidDiningAttemptBatch({
    generated: '2026-08-21T20:00:00.000Z',
    failures: ['locations-feed', 'nsop-2026', 'labor-day-2026', 'fall-2026', 'cafe-east'],
  });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: outage,
  })).status, 204);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, resolved);
  const retained = await store.getSnapshot();
  assert.ok(retained.sources.every(source => source.lastAttemptResult === 'failure'));
  assert.deepEqual(
    retained.sources.map(source => source.lastSuccessAt),
    [first.generated, first.generated, second.generated, second.generated, second.generated],
  );
});

test('migrates retained four-source state after Café East initializes', async () => {
  const previous = legacySourceState();
  const store = memoryStore(previous);
  const service = createDiningHoursService({ store, updateSecret: 'test-secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 200);

  const first = makeValidDiningAttemptBatch({ failures: ['cafe-east'] });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: first,
  })).status, 204);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, previous.snapshot);

  const second = makeValidDiningAttemptBatch({
    generated: '2026-08-21T16:00:00.000Z',
    failures: ['locations-feed', 'nsop-2026', 'labor-day-2026', 'fall-2026'],
  });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: second,
  })).status, 204);
  const migrated = await store.getSnapshot();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.sources.length, 5);
  assert.equal(migrated.snapshot.schemaVersion, 3);
  assert.ok(migrated.snapshot.locations.some((location) => location.id === 'cafe-east'));
});

test('initializes Barnard independently and prevents an older batch contract from downgrading v4', async () => {
  const previous = makeValidDiningSnapshotV3();
  const store = memoryStore(previous);
  const service = createDiningHoursService({ store, updateSecret: 'test-secret' });

  const first = makeValidDiningAttemptBatch({
    schemaVersion: 3,
    generated: '2026-08-24T12:00:00.000Z',
    failures: ['barnard-hours'],
  });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: first,
  })).status, 204);
  assert.deepEqual((await service.handle({ method: 'GET' })).body, previous);

  const second = makeValidDiningAttemptBatch({
    schemaVersion: 3,
    generated: '2026-08-24T16:00:00.000Z',
    failures: ['locations-feed', 'nsop-2026', 'labor-day-2026', 'fall-2026', 'cafe-east'],
  });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: second,
  })).status, 204);
  const initialized = await store.getSnapshot();
  assert.equal(initialized.schemaVersion, 3);
  assert.equal(initialized.snapshot.schemaVersion, 4);
  assert.equal(initialized.snapshot.sources.at(-1).fetchedAt, second.generated);
  assert.equal(initialized.snapshot.locations.length, 21);

  const olderContract = makeValidDiningAttemptBatch({ generated: '2026-08-24T20:00:00.000Z' });
  assert.equal((await service.handle({
    method: 'PUT', authorization: 'Bearer test-secret', body: olderContract,
  })).status, 204);
  const retained = await store.getSnapshot();
  assert.equal(retained.schemaVersion, 3);
  assert.equal(retained.snapshot.schemaVersion, 4);
  assert.equal(retained.snapshot.sources.at(-1).fetchedAt, second.generated);
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

test('upgrades a v3 source state to the v5 Fall Break overlay without freezing the other sources', async () => {
  const store = memoryStore(null);
  const service = createDiningHoursService({ store, updateSecret: 'test-secret' });
  // Production today: a v3 state publishing a v4 snapshot.
  const v3 = makeValidDiningAttemptBatch({ schemaVersion: 3, generated: '2026-10-13T16:00:00.000Z' });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: v3 })).status, 204);
  assert.equal((await store.getSnapshot()).snapshot.schemaVersion, 4);

  // The first v4 batch whose Fall Break article is challenged still publishes everything else.
  const blocked = makeValidDiningAttemptBatch({
    schemaVersion: 4, generated: '2026-10-13T20:00:00.000Z', failures: ['fall-break-2026'],
  });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: blocked })).status, 204);
  const partial = await store.getSnapshot();
  assert.equal(partial.schemaVersion, 4);
  assert.equal(partial.sources.length, 7);
  assert.equal(partial.snapshot.schemaVersion, 4);
  assert.equal(partial.snapshot.generated, blocked.generated);

  // Once the article parses, the snapshot becomes v5 and carries its source.
  const window = makeValidDiningAttemptBatch({ schemaVersion: 4, generated: '2026-10-28T16:00:00.000Z' });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer test-secret', body: window })).status, 204);
  const body = (await service.handle({ method: 'GET' })).body;
  assert.equal(body.schemaVersion, 5);
  assert.equal(body.sources.at(-1).id, 'fall-break-2026');
  const day = (id, date) => body.locations.find(location => location.id === id).days.find(item => item.date === date);
  assert.deepEqual(day('ferris', '2026-10-31'), {
    date: '2026-10-31', intervals: [['10:00', '19:00']], status: 'Fall Break 2026 hours', sourceId: 'fall-break-2026',
  });
  assert.deepEqual(day('johnjay', '2026-10-31'), {
    date: '2026-10-31', intervals: [], status: 'Closed', sourceId: 'fall-break-2026',
  });
  assert.deepEqual(day('facultyhouse', '2026-10-29').intervals, [['07:30', '14:00'], ['17:00', '21:00']]);
  // "All retail locations operate with normal hours on Thursday": the feed still decides.
  assert.equal(day('bj-butler', '2026-10-29').sourceId, 'locations-feed');
  assert.deepEqual(day('bj-everett', '2026-11-02').intervals, [['08:30', '14:30']]);
  assert.equal(day('bj-uris', '2026-11-02').status, 'Closed');
  // Café East and Barnard keep their own sources.
  assert.equal(day('cafe-east', '2026-10-31').sourceId, 'cafe-east');
  assert.equal(day('hewitt', '2026-10-31').sourceId === 'fall-break-2026', false);
  // November 4 is outside the break.
  assert.equal(day('johnjay', '2026-11-04').sourceId, 'locations-feed');
});
