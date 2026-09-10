/**
 * Pending-action store for the Telegram bot (docs/telegram-bot.md §2, §3.1).
 *
 * A pending action is created when the owner sends a state-changing command,
 * bound to the confirm message once Telegram has assigned it an id, and
 * claimed atomically when a [Confirm]/[Cancel] button is tapped. The claim is
 * a SET NX on a sibling key, so two taps racing through two function
 * invocations cannot both execute (R5). Records are never deleted before
 * execution: the outcome is written onto the same record with a 24 h TTL so a
 * late tap can be told what happened.
 *
 * Keys:
 *   lionhour:tg:pending:<id>        JSON record, TTL 10 min while pending, 24 h once finished
 *   lionhour:tg:pending:<id>:claim  SET NX marker, TTL 24 h
 *   lionhour:tg:recent:<scope>      SET NX marker for the per-workflow re-run cooldown
 *
 * Two implementations share one shape: Redis (Upstash) for the API route and an
 * in-memory one for tests. Both expose { create, bindMessage, get, claim, finish,
 * cooldown }.
 */

import { randomBytes } from 'node:crypto';

export const PENDING_TTL_SECONDS = 10 * 60;
export const FINISHED_TTL_SECONDS = 24 * 60 * 60;
export const RERUN_COOLDOWN_SECONDS = 30 * 60;

const KEY = 'lionhour:tg:pending';
const RECENT_KEY = 'lionhour:tg:recent';

export function newPendingId() {
  return randomBytes(8).toString('hex');
}

function parse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** @param {import('@upstash/redis').Redis} redis */
export function createRedisPendingStore(redis, { now = () => new Date() } = {}) {
  return {
    async create({ action, args, ownerId, chatId }) {
      const id = newPendingId();
      const record = {
        id, action, args, ownerId: String(ownerId), chatId: String(chatId), messageId: null,
        state: 'pending', createdAt: now().toISOString(),
      };
      await redis.set(`${KEY}:${id}`, JSON.stringify(record), { ex: PENDING_TTL_SECONDS });
      return record;
    },

    async bindMessage(id, messageId) {
      const record = parse(await redis.get(`${KEY}:${id}`));
      if (!record) return null;
      record.messageId = String(messageId);
      await redis.set(`${KEY}:${id}`, JSON.stringify(record), { keepTtl: true });
      return record;
    },

    async get(id) {
      return parse(await redis.get(`${KEY}:${id}`));
    },

    /** First caller wins; returns false for every later caller. */
    async claim(id) {
      const result = await redis.set(`${KEY}:${id}:claim`, now().toISOString(), { nx: true, ex: FINISHED_TTL_SECONDS });
      if (result !== 'OK') return false;
      const record = parse(await redis.get(`${KEY}:${id}`));
      if (record) {
        record.state = 'claimed';
        record.claimedAt = now().toISOString();
        await redis.set(`${KEY}:${id}`, JSON.stringify(record), { ex: FINISHED_TTL_SECONDS });
      }
      return true;
    },

    async finish(id, { state, result }) {
      const record = parse(await redis.get(`${KEY}:${id}`)) || { id };
      Object.assign(record, { state, result: result ?? null, finishedAt: now().toISOString() });
      await redis.set(`${KEY}:${id}`, JSON.stringify(record), { ex: FINISHED_TTL_SECONDS });
      return record;
    },

    /**
     * Per-scope cooldown. `check` reports the seconds left (0 when clear);
     * `start` takes the slot and returns false if someone already holds it.
     */
    cooldown: {
      async check(scope) {
        const ttl = await redis.ttl(`${RECENT_KEY}:${scope}`);
        return typeof ttl === 'number' && ttl > 0 ? ttl : 0;
      },
      async start(scope, seconds = RERUN_COOLDOWN_SECONDS) {
        const result = await redis.set(`${RECENT_KEY}:${scope}`, now().toISOString(), { nx: true, ex: seconds });
        return result === 'OK';
      },
      async clear(scope) {
        await redis.del(`${RECENT_KEY}:${scope}`);
      },
    },
  };
}

/** In-memory twin of the Redis store, with real expiry driven by `now()`. */
export function createMemoryPendingStore({ now = () => new Date() } = {}) {
  const records = new Map();   // id → { record, expiresAt }
  const claims = new Set();
  const recent = new Map();    // scope → expiresAt (ms)

  function live(id) {
    const entry = records.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= now().getTime()) { records.delete(id); return null; }
    return entry;
  }

  return {
    async create({ action, args, ownerId, chatId }) {
      const id = newPendingId();
      const record = {
        id, action, args, ownerId: String(ownerId), chatId: String(chatId), messageId: null,
        state: 'pending', createdAt: now().toISOString(),
      };
      records.set(id, { record, expiresAt: now().getTime() + PENDING_TTL_SECONDS * 1000 });
      return structuredClone(record);
    },
    async bindMessage(id, messageId) {
      const entry = live(id);
      if (!entry) return null;
      entry.record.messageId = String(messageId);
      return structuredClone(entry.record);
    },
    async get(id) {
      const entry = live(id);
      return entry ? structuredClone(entry.record) : null;
    },
    async claim(id) {
      if (claims.has(id)) return false;
      claims.add(id);
      const entry = live(id);
      if (entry) {
        entry.record.state = 'claimed';
        entry.record.claimedAt = now().toISOString();
        entry.expiresAt = now().getTime() + FINISHED_TTL_SECONDS * 1000;
      }
      return true;
    },
    async finish(id, { state, result }) {
      const entry = live(id) || { record: { id }, expiresAt: 0 };
      Object.assign(entry.record, { state, result: result ?? null, finishedAt: now().toISOString() });
      entry.expiresAt = now().getTime() + FINISHED_TTL_SECONDS * 1000;
      records.set(id, entry);
      return structuredClone(entry.record);
    },
    cooldown: {
      async check(scope) {
        const until = recent.get(scope);
        if (!until) return 0;
        const left = Math.ceil((until - now().getTime()) / 1000);
        if (left <= 0) { recent.delete(scope); return 0; }
        return left;
      },
      async start(scope, seconds = RERUN_COOLDOWN_SECONDS) {
        if (await this.check(scope) > 0) return false;
        recent.set(scope, now().getTime() + seconds * 1000);
        return true;
      },
      async clear(scope) {
        recent.delete(scope);
      },
    },
    /** test hook */
    _records: records,
  };
}
