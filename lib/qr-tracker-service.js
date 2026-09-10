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
  { id: 'butler-closure', label: 'Butler Closure' },
]);

const POSTER_IDS = new Set(POSTERS.map(({ id }) => id));
const PREVIEW_IMAGE_URL = 'https://lionhour.com/assets/lionhour-social-hero-v7.png';

function previewPage(poster) {
  const trackedUrl = `https://lionhour.com/qr/${poster}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,follow">
  <title>LionHour — What's open at Columbia</title>
  <meta name="description" content="Check real-time building hours at Columbia University. Libraries, gyms, dining halls, and more.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${trackedUrl}">
  <meta property="og:title" content="LionHour — What's open at Columbia">
  <meta property="og:description" content="Check real-time building hours at Columbia University. Libraries, gyms, dining halls, and more.">
  <meta property="og:image" content="${PREVIEW_IMAGE_URL}">
  <meta property="og:image:width" content="1730">
  <meta property="og:image:height" content="909">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="LionHour — What's open at Columbia">
  <meta name="twitter:description" content="Check real-time building hours at Columbia University. Libraries, gyms, dining halls, and more.">
  <meta name="twitter:image" content="${PREVIEW_IMAGE_URL}">
</head>
<body>
  <p>Opening LionHour… <a href="/">Continue to LionHour</a></p>
  <script>
    (function () {
      var fallback;
      function redirect() {
        clearTimeout(fallback);
        window.location.replace('/');
      }
      fallback = setTimeout(redirect, 1500);
      fetch('/qr/${poster}', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true
      }).catch(function () {}).finally(redirect);
    }());
  </script>
</body>
</html>`;
}

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
      if (request.method !== 'GET' && request.method !== 'POST') {
        return {
          status: 405,
          headers: noStoreHeaders({ Allow: 'GET, POST' }),
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

      if (request.method === 'GET') {
        return {
          status: 200,
          headers: noStoreHeaders({
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
          }),
          body: previewPage(request.poster),
        };
      }

      try {
        await store.recordScan(request.poster, dateInEastern(now()));
      } catch (error) {
        logger.error('QR scan recording failed', { name: error?.name });
      }

      return {
        status: 204,
        headers: noStoreHeaders(),
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
