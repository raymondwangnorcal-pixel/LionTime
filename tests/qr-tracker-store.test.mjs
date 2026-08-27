import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrTrackerStore } from '../lib/qr-tracker-store.js';

function createMemoryRedis() {
  const hashes = new Map();
  const expirations = new Map();

  function increment(key, field, amount) {
    const hash = hashes.get(key) || {};
    hash[field] = (Number(hash[field]) || 0) + amount;
    hashes.set(key, hash);
  }

  return {
    pipeline() {
      const operations = [];
      return {
        hincrby(key, field, amount) {
          operations.push(() => increment(key, field, amount));
          return this;
        },
        expire(key, seconds) {
          operations.push(() => expirations.set(key, seconds));
          return this;
        },
        async exec() {
          for (const operation of operations) operation();
          return operations.map(() => [null, 1]);
        },
      };
    },
    async hgetall(key) {
      const value = hashes.get(key);
      return value ? { ...value } : null;
    },
    inspect() {
      return {
        hashes: Object.fromEntries(hashes),
        expirations: Object.fromEntries(expirations),
      };
    },
  };
}

test('records all-time and daily poster totals while bounding daily retention', async () => {
  const redis = createMemoryRedis();
  const store = createQrTrackerStore(redis);

  await store.recordScan('dodge', '2026-08-27');
  await store.recordScan('dodge', '2026-08-27');
  await store.recordScan('ferris', '2026-08-27');

  assert.deepEqual(redis.inspect(), {
    hashes: {
      'lionhour:qr-scans:all': { dodge: 2, ferris: 1 },
      'lionhour:qr-scans:day:2026-08-27': { dodge: 2, ferris: 1 },
    },
    expirations: {
      'lionhour:qr-scans:day:2026-08-27': 34560000,
    },
  });
});

test('returns empty or numeric all-time and daily totals', async () => {
  const redis = createMemoryRedis();
  const store = createQrTrackerStore(redis);

  assert.deepEqual(await store.getStats('2026-08-27'), { allTime: {}, today: {} });

  await store.recordScan('hewitt', '2026-08-27');
  await store.recordScan('hewitt', '2026-08-27');
  assert.deepEqual(await store.getStats('2026-08-27'), {
    allTime: { hewitt: 2 },
    today: { hewitt: 2 },
  });
});
