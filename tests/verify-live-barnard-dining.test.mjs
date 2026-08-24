import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchVerifiedBarnardDining,
  verifyBarnardDiningSnapshot,
} from '../scripts/verify-live-barnard-dining.mjs';
import {
  makeValidDiningSnapshotV3,
  makeValidDiningSnapshotV4,
} from './helpers/dining-hours-fixture.mjs';

test('accepts a valid schema-version-4 snapshot with all four Barnard venues', () => {
  const snapshot = makeValidDiningSnapshotV4();

  assert.equal(verifyBarnardDiningSnapshot(snapshot), snapshot);
});

test('rejects legacy snapshots and missing Barnard venues', () => {
  assert.throws(
    () => verifyBarnardDiningSnapshot(makeValidDiningSnapshotV3()),
    /schema version 4/,
  );

  const missing = makeValidDiningSnapshotV4();
  missing.locations = missing.locations.filter(({ id }) => id !== 'lizs-place');
  assert.throws(() => verifyBarnardDiningSnapshot(missing), /invalid Dining snapshot|lizs-place/);
});

test('retries a retained legacy snapshot and uses a cache-busting request', async () => {
  const snapshots = [makeValidDiningSnapshotV3(), makeValidDiningSnapshotV4()];
  const requestedUrls = [];
  const waits = [];

  const snapshot = await fetchVerifiedBarnardDining('https://lionhour.com/api/dining-hours', {
    attempts: 3,
    fetchImpl: async (url, options) => {
      requestedUrls.push([String(url), options]);
      return { ok: true, status: 200, json: async () => snapshots.shift() };
    },
    sleep: async milliseconds => waits.push(milliseconds),
  });

  assert.equal(snapshot.schemaVersion, 4);
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every(([url]) => new URL(url).searchParams.has('verify')));
  assert.ok(requestedUrls.every(([, options]) => options.headers['Cache-Control'] === 'no-cache'));
  assert.deepEqual(waits, [5_000]);
});

test('reports the final validation error after bounded attempts', async () => {
  let calls = 0;

  await assert.rejects(
    fetchVerifiedBarnardDining('https://lionhour.com/api/dining-hours', {
      attempts: 2,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => makeValidDiningSnapshotV3() };
      },
      sleep: async () => {},
    }),
    /schema version 4/,
  );
  assert.equal(calls, 2);
});
