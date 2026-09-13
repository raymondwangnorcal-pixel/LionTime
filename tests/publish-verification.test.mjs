import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PublishVerificationError,
  fetchPublishedSnapshot,
  readGenerated,
  verifyPublishedSnapshot,
} from '../lib/publish-verification.js';

const GENERATED = '2026-09-13T04:20:00.000Z';

function response(body, { redirected = false, url = 'https://lionhour.com/api/library-hours', status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, redirected, url, json: async () => body };
}

test('readGenerated rejects a document without a usable timestamp', () => {
  assert.equal(readGenerated({ generated: GENERATED }), GENERATED);
  assert.throws(() => readGenerated({}), /no usable "generated" timestamp/);
  assert.throws(() => readGenerated({ generated: 'whenever' }), /no usable "generated" timestamp/);
});

test('verifyPublishedSnapshot accepts the run\'s own snapshot and the same instant in another offset', () => {
  const snapshot = { generated: GENERATED };
  assert.equal(verifyPublishedSnapshot({ expectedGenerated: GENERATED, snapshot }), snapshot);

  const sameInstant = { generated: '2026-09-13T00:20:00.000-04:00' };
  assert.equal(
    verifyPublishedSnapshot({ expectedGenerated: GENERATED, snapshot: sameInstant }),
    sameInstant,
  );
});

test('verifyPublishedSnapshot rejects the snapshot a silent no-op publish leaves in place', () => {
  assert.throws(
    () => verifyPublishedSnapshot({
      expectedGenerated: GENERATED,
      snapshot: { generated: '2026-09-10T19:35:42.635Z' },
    }),
    (error) => {
      assert.ok(error instanceof PublishVerificationError);
      assert.match(error.message, /not serving this run's snapshot/);
      assert.match(error.message, /2026-09-10T19:35:42\.635Z/);
      assert.match(error.message, /a redirect is not followed/);
      return true;
    },
  );
});

test('a cross-origin redirect fails immediately and names the destination', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPublishedSnapshot('https://www.lionhour.com/api/library-hours', {
      attempts: 3,
      fetchImpl: async () => {
        calls += 1;
        return response({ generated: GENERATED }, { redirected: true, url: 'https://lionhour.com/api/library-hours' });
      },
      sleep: async () => assert.fail('a redirect must not be retried'),
    }),
    /https:\/\/www\.lionhour\.com redirects to https:\/\/lionhour\.com/,
  );
  assert.equal(calls, 1, 'the redirect is reported on the first attempt');
});

test('the fetch defeats the edge cache and retries a transient failure', async () => {
  const requested = [];
  const waits = [];
  const bodies = [null, { generated: GENERATED }];

  const snapshot = await fetchPublishedSnapshot('https://lionhour.com/api/library-hours', {
    attempts: 3,
    fetchImpl: async (url, options) => {
      requested.push([String(url), options]);
      const body = bodies.shift();
      return body ? response(body) : response(null, { status: 503 });
    },
    sleep: async milliseconds => waits.push(milliseconds),
  });

  assert.deepEqual(snapshot, { generated: GENERATED });
  assert.equal(requested.length, 2);
  assert.ok(requested.every(([url]) => new URL(url).pathname === '/api/library-hours'));
  assert.ok(requested.every(([url]) => new URL(url).searchParams.has('verify')));
  assert.notEqual(
    new URL(requested[0][0]).searchParams.get('verify'),
    new URL(requested[1][0]).searchParams.get('verify'),
    'each attempt busts the cache with its own key',
  );
  assert.ok(requested.every(([, options]) => options.headers['Cache-Control'] === 'no-cache'));
  assert.deepEqual(waits, [5_000]);
});

test('a non-HTTPS URL and an out-of-range attempt count are refused', async () => {
  await assert.rejects(
    fetchPublishedSnapshot('http://lionhour.com/api/library-hours', { fetchImpl: async () => response({}) }),
    /must use HTTPS/,
  );
  await assert.rejects(
    fetchPublishedSnapshot('https://lionhour.com/api/library-hours', { attempts: 0, fetchImpl: async () => response({}) }),
    /one through five/,
  );
});

test('the reported error survives every attempt being spent', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPublishedSnapshot('https://lionhour.com/api/library-hours', {
      attempts: 2,
      fetchImpl: async () => { calls += 1; return response(null, { status: 500 }); },
      sleep: async () => {},
    }),
    /HTTP 500/,
  );
  assert.equal(calls, 2);
});
