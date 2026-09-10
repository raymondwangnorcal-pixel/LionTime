import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createQrTrackerService } from '../lib/qr-tracker-service.js';

test('records one browser scan and redirects from the preview landing to LionHour', { timeout: 10_000 }, async () => {
  const recorded = [];
  const service = createQrTrackerService({
    store: {
      async recordScan(poster, date) {
        recorded.push({ poster, date });
      },
      async getStats() {
        return { allTime: {}, today: {} };
      },
    },
    now: () => new Date('2026-09-10T16:00:00Z'),
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.route('https://lionhour.test/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>LionHour</title>' });
        return;
      }

      const poster = url.pathname.match(/^\/qr\/([^/]+)$/)?.[1];
      if (!poster) {
        await route.fulfill({ status: 404, body: 'Not found' });
        return;
      }

      const response = await service.handleScan({ method: request.method(), poster });
      const options = { status: response.status, headers: response.headers };
      if (response.body !== null) options.body = response.body;
      await route.fulfill(options);
    });

    await page.goto('https://lionhour.test/qr/dodge');
    await page.waitForURL('https://lionhour.test/', { timeout: 2_000 });

    assert.deepEqual(recorded, [{ poster: 'dodge', date: '2026-09-10' }]);
  } finally {
    await browser.close();
  }
});
