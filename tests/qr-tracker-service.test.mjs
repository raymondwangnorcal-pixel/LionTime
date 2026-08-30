import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrTrackerService } from '../lib/qr-tracker-service.js';

const FIXED_NOW = new Date('2026-08-27T16:00:00Z');

function createMemoryStore(initial = {}) {
  const allTime = { ...(initial.allTime || {}) };
  const daily = structuredClone(initial.daily || {});

  return {
    async recordScan(poster, date) {
      allTime[poster] = (allTime[poster] || 0) + 1;
      daily[date] ||= {};
      daily[date][poster] = (daily[date][poster] || 0) + 1;
    },
    async getStats(date) {
      return {
        allTime: { ...allTime },
        today: { ...(daily[date] || {}) },
      };
    },
    inspect() {
      return { allTime: structuredClone(allTime), daily: structuredClone(daily) };
    },
  };
}

test('records each approved poster scan before redirecting without caching', async () => {
  const store = createMemoryStore();
  const service = createQrTrackerService({ store, now: () => FIXED_NOW });

  for (const poster of ['dodge', 'butler', 'dining', 'ferris', 'hewitt', 'plug', 'feedback', 'orientation']) {
    const response = await service.handleScan({ method: 'GET', poster });
    assert.equal(response.status, 302);
    assert.equal(response.headers.Location, '/');
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }

  assert.deepEqual(store.inspect(), {
    allTime: {
      dodge: 1,
      butler: 1,
      dining: 1,
      ferris: 1,
      hewitt: 1,
      plug: 1,
      feedback: 1,
      orientation: 1,
    },
    daily: {
      '2026-08-27': {
        dodge: 1,
        butler: 1,
        dining: 1,
        ferris: 1,
        hewitt: 1,
        plug: 1,
        feedback: 1,
        orientation: 1,
      },
    },
  });
});

test('rejects unknown posters and unsupported methods without recording a scan', async () => {
  const store = createMemoryStore();
  const service = createQrTrackerService({ store, now: () => FIXED_NOW });

  const unknown = await service.handleScan({ method: 'GET', poster: 'unknown' });
  const unsupported = await service.handleScan({ method: 'POST', poster: 'dodge' });

  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { error: 'Unknown QR poster' });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.Allow, 'GET');
  assert.deepEqual(store.inspect(), { allTime: {}, daily: {} });
});

test('redirects visitors even when recording fails', async () => {
  const messages = [];
  const service = createQrTrackerService({
    store: {
      async recordScan() { throw new Error('storage detail'); },
      async getStats() { throw new Error('storage detail'); },
    },
    now: () => FIXED_NOW,
    logger: { error(message) { messages.push(message); } },
  });

  const response = await service.handleScan({ method: 'GET', poster: 'dodge' });

  assert.equal(response.status, 302);
  assert.equal(response.headers.Location, '/');
  assert.deepEqual(messages, ['QR scan recording failed']);
});

test('returns authenticated scan totals ranked by all-time performance', async () => {
  const store = createMemoryStore({
    allTime: { dodge: 8, butler: 3, dining: 11, ferris: 19 },
    daily: { '2026-08-27': { dodge: 2, dining: 4, ferris: 1 } },
  });
  const service = createQrTrackerService({
    store,
    statsSecret: 'test-secret',
    now: () => FIXED_NOW,
  });

  const response = await service.handleStats({
    method: 'GET',
    authorization: 'Bearer test-secret',
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(response.body, {
    date: '2026-08-27',
    posters: [
      { id: 'ferris', label: 'Ferris', allTime: 19, today: 1 },
      { id: 'dining', label: 'General Dining', allTime: 11, today: 4 },
      { id: 'dodge', label: 'Dodge', allTime: 8, today: 2 },
      { id: 'butler', label: 'Butler', allTime: 3, today: 0 },
      { id: 'feedback', label: 'Feedback', allTime: 0, today: 0 },
      { id: 'hewitt', label: 'Hewitt', allTime: 0, today: 0 },
      { id: 'orientation', label: 'Orientation', allTime: 0, today: 0 },
      { id: 'plug', label: 'Plug', allTime: 0, today: 0 },
    ],
  });
});

test('protects scan totals and handles unsupported or failed requests', async () => {
  const store = createMemoryStore();
  const service = createQrTrackerService({
    store,
    statsSecret: 'test-secret',
    now: () => FIXED_NOW,
    logger: { error() {} },
  });

  assert.equal((await service.handleStats({ method: 'GET' })).status, 401);
  assert.equal((await service.handleStats({ method: 'GET', authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await service.handleStats({ method: 'POST', authorization: 'Bearer test-secret' })).status, 405);

  const failed = createQrTrackerService({
    store: {
      async recordScan() {},
      async getStats() { throw new Error('storage detail'); },
    },
    statsSecret: 'test-secret',
    now: () => FIXED_NOW,
    logger: { error() {} },
  });
  const failure = await failed.handleStats({ method: 'GET', authorization: 'Bearer test-secret' });
  assert.equal(failure.status, 500);
  assert.deepEqual(failure.body, { error: 'Internal server error' });
});
