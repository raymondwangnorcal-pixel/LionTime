import { timingSafeEqual } from 'node:crypto';

const POSTERS = Object.freeze([
  { id: 'dodge', label: 'Dodge' },
  { id: 'butler', label: 'Butler' },
  { id: 'dining', label: 'General Dining' },
  { id: 'ferris', label: 'Ferris' },
  { id: 'hewitt', label: 'Hewitt' },
  { id: 'plug', label: 'Plug' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'orientation', label: 'Orientation' },
  { id: 'discord', label: 'Discord' },
  { id: 'reddit', label: 'Reddit' },
]);

const POSTER_IDS = new Set(POSTERS.map(({ id }) => id));

function dateInEastern(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function secretsMatch(authorization, expectedSecret) {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedSecret || '');
  return actualBytes.length > 0
    && actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function noStoreHeaders(extra = {}) {
  return { ...extra, 'Cache-Control': 'no-store' };
}

export function createQrTrackerService({
  store,
  statsSecret,
  now = () => new Date(),
  logger = console,
}) {
  return {
    async handleScan(request) {
      if (request.method !== 'GET') {
        return {
          status: 405,
          headers: noStoreHeaders({ Allow: 'GET' }),
          body: { error: 'Method not allowed' },
        };
      }

      if (typeof request.poster !== 'string' || !POSTER_IDS.has(request.poster)) {
        return {
          status: 404,
          headers: noStoreHeaders(),
          body: { error: 'Unknown QR poster' },
        };
      }

      try {
        await store.recordScan(request.poster, dateInEastern(now()));
      } catch (error) {
        logger.error('QR scan recording failed', { name: error?.name });
      }

      return {
        status: 302,
        headers: noStoreHeaders({ Location: '/' }),
        body: null,
      };
    },

    async handleStats(request) {
      if (request.method !== 'GET') {
        return {
          status: 405,
          headers: noStoreHeaders({ Allow: 'GET' }),
          body: { error: 'Method not allowed' },
        };
      }

      if (!secretsMatch(request.authorization, statsSecret)) {
        return {
          status: 401,
          headers: noStoreHeaders(),
          body: { error: 'Unauthorized' },
        };
      }

      try {
        const date = dateInEastern(now());
        const stats = await store.getStats(date);
        const posters = POSTERS.map(({ id, label }) => ({
          id,
          label,
          allTime: stats.allTime[id] || 0,
          today: stats.today[id] || 0,
        })).sort((a, b) => b.allTime - a.allTime || a.label.localeCompare(b.label));

        return {
          status: 200,
          headers: noStoreHeaders(),
          body: { date, posters },
        };
      } catch (error) {
        logger.error('QR scan reporting failed', { name: error?.name });
        return {
          status: 500,
          headers: noStoreHeaders(),
          body: { error: 'Internal server error' },
        };
      }
    },
  };
}
