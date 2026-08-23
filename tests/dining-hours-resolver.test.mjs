import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseFallArticle, parseLaborDayArticle, parseNsopArticle } from '../lib/dining-article-parser.js';
import { resolveDiningSnapshot } from '../lib/dining-hours-resolver.js';
import { makeValidDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

const html = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const evidence = () => ({
  nsop: parseNsopArticle(html('dining-nsop-2026.html')),
  labor: parseLaborDayArticle(html('dining-labor-day-2026.html')),
  fall: parseFallArticle(html('dining-fall-2026.html')),
});

function snapshotStarting(date) {
  const snapshot = makeValidDiningSnapshot();
  snapshot.generated = `${date}T12:00:00-04:00`;
  snapshot.windowStart = date;
  const start = new Date(`${date}T12:00:00Z`);
  const dates = Array.from({ length: 14 }, (_unused, index) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + index);
    return value.toISOString().slice(0, 10);
  });
  snapshot.windowEnd = dates.at(-1);
  for (const location of snapshot.locations) {
    location.days = dates.map((day) => ({ date: day, intervals: [], status: 'Hours not published' }));
  }
  return snapshot;
}

test('keeps uncovered transition dates unpublished and NSOP separate from venues', () => {
  const result = resolveDiningSnapshot({ baseSnapshot: snapshotStarting('2026-08-27'), ...evidence() });
  const ferris = result.locations.find(({ id }) => id === 'ferris');
  assert.deepEqual(ferris.days[0], {
    date: '2026-08-27', intervals: [], status: 'Hours not published', sourceId: 'unpublished',
  });
  assert.deepEqual(ferris.days[1], {
    date: '2026-08-28', intervals: [], status: 'Hours not published', sourceId: 'unpublished',
  });
  assert.equal(result.specialServices[0].countsAsOpen, false);
  assert.equal(result.specialServices[0].days.length, 6);
  assert.deepEqual(ferris.days[3].intervals, []);
});

test('uses Labor Day exceptions before structured and Fall evidence', () => {
  const baseSnapshot = snapshotStarting('2026-09-04');
  const ferris = baseSnapshot.locations.find(({ id }) => id === 'ferris');
  ferris.days[0] = {
    date: '2026-09-04', intervals: [['01:00', '02:00']], status: 'Structured hours',
  };
  const result = resolveDiningSnapshot({ baseSnapshot, ...evidence() });
  const resolved = result.locations.find(({ id }) => id === 'ferris');
  assert.deepEqual(resolved.days[0].intervals, [['09:00', '20:00']]);
  assert.equal(resolved.days[0].sourceId, 'labor-day-2026');
  const chefMike = result.locations.find(({ id }) => id === 'chefmikes');
  assert.equal(chefMike.days[3].status, 'Hours not published');
});

test('uses structured closures before Fall and fills only listed Fall venues', () => {
  const baseSnapshot = snapshotStarting('2026-09-08');
  const ferris = baseSnapshot.locations.find(({ id }) => id === 'ferris');
  ferris.days[0] = { date: '2026-09-08', intervals: [], status: 'Closed for private event' };
  const result = resolveDiningSnapshot({ baseSnapshot, ...evidence() });
  const resolvedFerris = result.locations.find(({ id }) => id === 'ferris');
  assert.equal(resolvedFerris.days[0].sourceId, 'locations-feed');
  assert.equal(resolvedFerris.days[0].status, 'Closed for private event');
  assert.deepEqual(resolvedFerris.days[4].intervals, [['09:00', '20:00']]);
  assert.deepEqual(resolvedFerris.days[5].intervals, [['10:00', '14:00'], ['16:00', '20:00']]);
  const smith = result.locations.find(({ id }) => id === 'smith-dining');
  assert.equal(smith.days[0].sourceId, 'unpublished');
});

test('does not apply Fall baselines after the bounded term', () => {
  const result = resolveDiningSnapshot({ baseSnapshot: snapshotStarting('2026-12-24'), ...evidence() });
  assert.ok(result.locations.every((location) => location.days.every((day) => day.sourceId === 'unpublished')));
  assert.deepEqual(result.specialServices, []);
});
