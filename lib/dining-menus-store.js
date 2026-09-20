import { Redis } from '@upstash/redis';

export const DINING_MENUS_KEY = 'lionhour:dining-menus:v1';

export function createDiningMenusStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() {
      return redis.get(DINING_MENUS_KEY);
    },
    async putSnapshot(snapshot) {
      await redis.set(DINING_MENUS_KEY, snapshot);
    },
  };
}
