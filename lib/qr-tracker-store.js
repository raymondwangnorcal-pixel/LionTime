import { Redis } from '@upstash/redis';

const ALL_TIME_KEY = 'lionhour:qr-scans:all';
const DAILY_KEY_PREFIX = 'lionhour:qr-scans:day';
const DAILY_TTL_SECONDS = 400 * 24 * 60 * 60;

function dailyKey(date) {
  return `${DAILY_KEY_PREFIX}:${date}`;
}

function normalizeTallies(raw) {
  if (!raw) return {};
  const tallies = {};
  for (const [poster, value] of Object.entries(raw)) {
    const count = Number.parseInt(value, 10);
    if (Number.isSafeInteger(count) && count > 0) tallies[poster] = count;
  }
  return tallies;
}

export function createQrTrackerStore(redis = Redis.fromEnv()) {
  return {
    async recordScan(poster, date) {
      const dayKey = dailyKey(date);
      const pipeline = redis.pipeline();
      pipeline.hincrby(ALL_TIME_KEY, poster, 1);
      pipeline.hincrby(dayKey, poster, 1);
      pipeline.expire(dayKey, DAILY_TTL_SECONDS);
      await pipeline.exec();
    },

    async getStats(date) {
      const [allTime, today] = await Promise.all([
        redis.hgetall(ALL_TIME_KEY),
        redis.hgetall(dailyKey(date)),
      ]);
      return {
        allTime: normalizeTallies(allTime),
        today: normalizeTallies(today),
      };
    },
  };
}
