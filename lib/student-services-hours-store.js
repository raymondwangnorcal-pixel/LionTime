import { Redis } from '@upstash/redis';

export const STUDENT_SERVICES_HOURS_KEY = 'lionhour:student-services-hours:v1';

export function createStudentServicesHoursStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() { return redis.get(STUDENT_SERVICES_HOURS_KEY); },
    async putSnapshot(snapshot) { await redis.set(STUDENT_SERVICES_HOURS_KEY, snapshot); },
  };
}
