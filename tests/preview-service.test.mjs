import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewService, libraryOverlay } from '../lib/preview-service.js';
import { PREVIEW_SUMMARY } from '../lib/preview-summary.generated.mjs';

function createMemoryStore(snapshot = null, fail = false) {
  return {
    async getSnapshot() { if (fail) throw new Error('storage detail'); return snapshot; },
  };
}

function snapshotWith(overrides = {}) {
  return {
    schemaVersion: 1,
    generated: '2026-09-13T12:00:00Z',
    libraries: [
      {
        id: 'butler_24',
        url: 'https://hours.library.columbia.edu/locations/butler',
        scrapeFailed: false,
        temporarilyClosed: false,
        schedules: [{
          start: '2026-09-01',
          end: '2026-09-30',
          hours: {
            0: { open: '10:00', close: '22:00' },
            1: { open: '10:00', close: '22:00' },
            2: { open: '10:00', close: '22:00' },
            3: { open: '10:00', close: '22:00' },
            4: { open: '10:00', close: '22:00' },
            5: { open: '10:00', close: '18:00' },
            6: null,
          },
        }],
        ...overrides,
      },
    ],
  };
}

function butlerIn(body) {
  return body.categories
    .find((category) => category.id === 'library')
    .venues.find((venue) => venue.id === 'butler');
}

test('serves the baseline summary with CORS and CDN cache headers', async () => {
  const service = createPreviewService({ libraryStore: null });
  const response = await service.handle({ method: 'GET' });

  assert.equal(response.status, 200);
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(
    response.headers['Cache-Control'],
    'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
  );
  assert.equal(
    response.body.categories.map((category) => category.id).join(','),
    PREVIEW_SUMMARY.categories.map((category) => category.id).join(','),
  );
  // Status is never computed server-side — a cached response has to stay
  // correct as the clock moves, so the consumer applies its own.
  for (const category of response.body.categories) {
    for (const venue of category.venues) {
      assert.deepEqual(Object.keys(venue.hours).sort(), ['0', '1', '2', '3', '4', '5', '6']);
      assert.equal('status' in venue, false);
    }
  }
});

test('lays the live library snapshot over the baseline', async () => {
  const service = createPreviewService({
    libraryStore: createMemoryStore(snapshotWith()),
    now: () => Date.parse('2026-09-13T16:00:00Z'),
  });
  const response = await service.handle({ method: 'GET' });

  assert.deepEqual(butlerIn(response.body).hours['1'], [['10:00', '22:00']]);
  assert.deepEqual(butlerIn(response.body).hours['6'], []);
  assert.equal(response.body.categories.find((c) => c.id === 'library').live, true);
});

test('flagged, stale and unreachable snapshots fall through to the baseline', async () => {
  const baseline = butlerIn((await createPreviewService({ libraryStore: null }).handle({ method: 'GET' })).body);

  const cases = {
    'scrape failed': snapshotWith({ scrapeFailed: true }),
    'embedded fallback': snapshotWith({ useEmbeddedFallback: true }),
    'schedule does not cover today': snapshotWith({
      schedules: [{ start: '2026-01-01', end: '2026-01-31', hours: snapshotWith().libraries[0].schedules[0].hours }],
    }),
  };

  for (const [label, snapshot] of Object.entries(cases)) {
    const service = createPreviewService({
      libraryStore: createMemoryStore(snapshot),
      now: () => Date.parse('2026-09-13T16:00:00Z'),
    });
    const response = await service.handle({ method: 'GET' });
    assert.deepEqual(butlerIn(response.body).hours, baseline.hours, label);
  }

  const broken = createPreviewService({
    libraryStore: createMemoryStore(null, true),
    logger: { error() {} },
  });
  const response = await broken.handle({ method: 'GET' });
  assert.equal(response.status, 200, 'a dead store still serves the baseline');
  assert.deepEqual(butlerIn(response.body).hours, baseline.hours);
  assert.equal(response.body.categories.find((c) => c.id === 'library').live, false);
});

test('a temporarily closed library reads as closed all week', () => {
  const overlay = libraryOverlay(snapshotWith({ temporarilyClosed: true }), '2026-09-13');
  assert.deepEqual(overlay.get('butler'), { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
});

test('preflight is answered and writes are refused', async () => {
  const service = createPreviewService({ libraryStore: null });
  assert.equal((await service.handle({ method: 'OPTIONS' })).status, 204);
  assert.equal((await service.handle({ method: 'POST' })).status, 405);
});
