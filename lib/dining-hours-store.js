import { Redis } from '@upstash/redis';

export const DINING_HOURS_KEY = 'lionhour:dining-hours:v1';

export function createDiningHoursStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() {
      return redis.get(DINING_HOURS_KEY);
    },
    async putSnapshot(snapshot) {
      await redis.set(DINING_HOURS_KEY, snapshot);
    },
  };
}
