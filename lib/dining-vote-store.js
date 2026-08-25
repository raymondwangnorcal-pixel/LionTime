import { Redis } from '@upstash/redis';

const KEY_PREFIX = 'lionhour:dining-vote';
const TTL_SECONDS = 172800; // 48 hours

function talliesKey(date) {
  return `${KEY_PREFIX}:${date}:tallies`;
}

function votersKey(date) {
  return `${KEY_PREFIX}:${date}:voters`;
}

export function createDiningVoteStore(redis = Redis.fromEnv()) {
  return {
    /** @returns {{ [hallId: string]: number }} */
    async getResults(date) {
      const raw = await redis.hgetall(talliesKey(date));
      if (!raw) return {};
      const results = {};
      for (const [key, value] of Object.entries(raw)) {
        const count = parseInt(value, 10);
        if (count > 0) results[key] = count;
      }
      return results;
    },

    /** @returns {string | null} */
    async getUserVote(date, fp) {
      const vote = await redis.hget(votersKey(date), fp);
      return typeof vote === 'string' ? vote : null;
    },

    /** Cast a new vote or change an existing one. Returns the previous hallId (or null). */
    async castVote(date, fp, hallId) {
      const tk = talliesKey(date);
      const vk = votersKey(date);

      const previous = await redis.hget(vk, fp);

      const pipeline = redis.pipeline();
      if (typeof previous === 'string' && previous !== hallId) {
        pipeline.hincrby(tk, previous, -1);
      }
      if (previous !== hallId) {
        pipeline.hincrby(tk, hallId, 1);
      }
      pipeline.hset(vk, { [fp]: hallId });
      pipeline.expire(tk, TTL_SECONDS);
      pipeline.expire(vk, TTL_SECONDS);
      await pipeline.exec();

      return typeof previous === 'string' ? previous : null;
    },
  };
}
