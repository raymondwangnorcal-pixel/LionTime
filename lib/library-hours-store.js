import { Redis } from '@upstash/redis';

export const LIBRARY_HOURS_KEY = 'lionhour:library-hours:v1';

export function createLibraryHoursStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() {
      return redis.get(LIBRARY_HOURS_KEY);
    },
    async putSnapshot(snapshot) {
      await redis.set(LIBRARY_HOURS_KEY, snapshot);
    },
  };
}
