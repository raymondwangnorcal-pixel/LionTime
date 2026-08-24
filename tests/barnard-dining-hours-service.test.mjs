import assert from 'node:assert/strict';
import test from 'node:test';

import { createBarnardDiningHoursService } from '../lib/barnard-dining-hours-service.js';
import { createDiningHoursService } from '../lib/dining-hours-service.js';
import { makeValidDiningAttemptBatch, makeValidDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

function memoryStore(initial = null) {
  let snapshot = initial;
  return {
    async getSnapshot() { return snapshot; },
    async putSnapshot(next) { snapshot = next; },
  };
}

test('projects the retained Barnard success independently of the legacy public snapshot', async () => {
  const store = memoryStore(makeValidDiningSnapshot());
  const dining = createDiningHoursService({ store, updateSecret: 'secret' });
  const batch = makeValidDiningAttemptBatch({
    schemaVersion: 3,
    failures: ['nsop-2026', 'labor-day-2026', 'fall-2026', 'cafe-east'],
  });
  assert.equal((await dining.handle({
    method: 'PUT', authorization: 'Bearer secret', body: batch,
  })).status, 204);

  const barnard = createBarnardDiningHoursService({ store });
  const response = await barnard.handle({ method: 'GET' });

  assert.equal(response.status, 200);
  assert.equal(response.body.schemaVersion, 1);
  assert.equal(response.body.generated, batch.generated);
  assert.equal(response.body.venues.length, 4);
  assert.match(response.headers['Cache-Control'], /s-maxage=300/);
  assert.equal((await dining.handle({ method: 'GET' })).body.schemaVersion, 1);
});

test('returns uninitialized, method, and storage failures safely', async () => {
  const empty = createBarnardDiningHoursService({ store: memoryStore(makeValidDiningSnapshot()) });
  assert.equal((await empty.handle({ method: 'GET' })).status, 503);
  assert.equal((await empty.handle({ method: 'PUT' })).status, 405);

  const errors = [];
  const failing = createBarnardDiningHoursService({
    store: { async getSnapshot() { throw new Error('redis down'); } },
    logger: { error(message, context) { errors.push([message, context]); } },
  });
  assert.equal((await failing.handle({ method: 'GET' })).status, 500);
  assert.deepEqual(errors[0][1], { name: 'Error' });
});
