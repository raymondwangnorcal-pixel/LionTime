import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchVerifiedBarnardDining,
  verifyBarnardDiningSnapshot,
} from '../scripts/verify-live-barnard-dining.mjs';
import {
  makeValidBarnardDiningSnapshot,
} from './helpers/dining-hours-fixture.mjs';

test('accepts a valid independent snapshot with all four Barnard venues', () => {
  const snapshot = makeValidBarnardDiningSnapshot();

  assert.equal(verifyBarnardDiningSnapshot(snapshot), snapshot);
});

test('rejects untrusted snapshots and missing Barnard venues', () => {
  const untrusted = makeValidBarnardDiningSnapshot();
  untrusted.source = 'https://example.com/hours';
  assert.throws(
    () => verifyBarnardDiningSnapshot(untrusted),
    /official Barnard Dining URL/,
  );

  const missing = makeValidBarnardDiningSnapshot();
  missing.venues = missing.venues.filter(({ id }) => id !== 'lizs-place');
  assert.throws(() => verifyBarnardDiningSnapshot(missing), /four Barnard Dining venues/);
});

test('retries a retained legacy snapshot and uses a cache-busting request', async () => {
  const invalid = makeValidBarnardDiningSnapshot();
  invalid.schemaVersion = 2;
  const snapshots = [invalid, makeValidBarnardDiningSnapshot()];
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

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every(([url]) => new URL(url).pathname === '/api/barnard-dining-hours'));
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
        const invalid = makeValidBarnardDiningSnapshot();
        invalid.schemaVersion = 2;
        return { ok: true, status: 200, json: async () => invalid };
      },
      sleep: async () => {},
    }),
    /schemaVersion must be 1/,
  );
  assert.equal(calls, 2);
});
