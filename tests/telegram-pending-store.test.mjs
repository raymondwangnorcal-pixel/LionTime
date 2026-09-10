import assert from 'node:assert/strict';
import test from 'node:test';

import { createRedisPendingStore, createMemoryPendingStore } from '../lib/telegram-pending-store.js';

/** Minimal Upstash-shaped fake: SET with nx/ex/keepTtl, GET, TTL, DEL, expiry driven by now(). */
function fakeRedis(now) {
  const data = new Map(); // key → { value, expiresAt|null }
  const live = (key) => {
    const e = data.get(key);
    if (!e) return null;
    if (e.expiresAt != null && e.expiresAt <= now().getTime()) { data.delete(key); return null; }
    return e;
  };
  return {
    calls: [],
    async set(key, value, opts = {}) {
      this.calls.push(['set', key, opts]);
      const existing = live(key);
      if (opts.nx && existing) return null;
      const expiresAt = opts.keepTtl ? (existing?.expiresAt ?? null) : opts.ex ? now().getTime() + opts.ex * 1000 : null;
      data.set(key, { value, expiresAt });
      return 'OK';
    },
    async get(key) { return live(key)?.value ?? null; },
    async ttl(key) { const e = live(key); if (!e) return -2; if (e.expiresAt == null) return -1; return Math.ceil((e.expiresAt - now().getTime()) / 1000); },
    async del(key) { data.delete(key); },
  };
}

for (const [label, make] of [
  ['redis', (now) => createRedisPendingStore(fakeRedis(now), { now })],
  ['memory', (now) => createMemoryPendingStore({ now })],
]) {
  test(`${label} store: create → bind → claim once → finish, with a 10-minute pending TTL`, async () => {
    let t = Date.parse('2026-09-10T20:00:00Z');
    const store = make(() => new Date(t));
    const record = await store.create({ action: 'rerun', args: { workflow: 'dining' }, ownerId: 1, chatId: 2 });
    assert.match(record.id, /^[a-f0-9]{16}$/);
    assert.equal((await store.get(record.id)).messageId, null);
    await store.bindMessage(record.id, 55);
    assert.equal((await store.get(record.id)).messageId, '55');

    assert.equal(await store.claim(record.id), true);
    assert.equal(await store.claim(record.id), false);
    assert.equal((await store.get(record.id)).state, 'claimed');
    await store.finish(record.id, { state: 'done', result: 'ok' });
    const done = await store.get(record.id);
    assert.equal(done.state, 'done');
    assert.equal(done.result, 'ok');

    // A finished record outlives the pending TTL; an untouched one does not.
    const fresh = await store.create({ action: 'rerun', args: {}, ownerId: 1, chatId: 2 });
    t += 11 * 60 * 1000;
    assert.equal(await store.get(fresh.id), null);
    assert.equal((await store.get(record.id)).state, 'done');
  });

  test(`${label} store: cooldown is first-come and expires`, async () => {
    let t = Date.parse('2026-09-10T20:00:00Z');
    const store = make(() => new Date(t));
    assert.equal(await store.cooldown.check('rerun:dining'), 0);
    assert.equal(await store.cooldown.start('rerun:dining', 60), true);
    assert.equal(await store.cooldown.start('rerun:dining', 60), false);
    assert.equal(await store.cooldown.check('rerun:dining'), 60);
    t += 30_000;
    assert.equal(await store.cooldown.check('rerun:dining'), 30);
    await store.cooldown.clear('rerun:dining');
    assert.equal(await store.cooldown.check('rerun:dining'), 0);
    assert.equal(await store.cooldown.start('rerun:dining', 60), true);
    t += 61_000;
    assert.equal(await store.cooldown.check('rerun:dining'), 0);
  });
}

test('redis store: the claim is a SET NX on a sibling key, and binding keeps the pending TTL', async () => {
  const now = () => new Date(Date.parse('2026-09-10T20:00:00Z'));
  const redis = fakeRedis(now);
  const store = createRedisPendingStore(redis, { now });
  const record = await store.create({ action: 'rerun', args: {}, ownerId: 1, chatId: 2 });
  await store.bindMessage(record.id, 9);
  await store.claim(record.id);
  const sets = redis.calls.filter(c => c[0] === 'set');
  assert.deepEqual(sets[0][2], { ex: 600 });
  assert.deepEqual(sets[1][2], { keepTtl: true });
  assert.equal(sets[2][1], `lionhour:tg:pending:${record.id}:claim`);
  assert.equal(sets[2][2].nx, true);
});
