import { Redis } from '@upstash/redis';

export const RECREATION_HOURS_KEY = 'lionhour:recreation-hours:v1';

export function createRecreationHoursStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() {
      return redis.get(RECREATION_HOURS_KEY);
    },
    async putSnapshot(snapshot) {
      await redis.set(RECREATION_HOURS_KEY, snapshot);
    },
  };
}
