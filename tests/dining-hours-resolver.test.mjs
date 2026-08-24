import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseFallArticle, parseLaborDayArticle, parseNsopArticle } from '../lib/dining-article-parser.js';
import { parseCafeEastPage } from '../lib/cafe-east-parser.js';
import { combineBarnardDiningWeeks, parseBarnardRenderedWeek } from '../lib/barnard-dining-hours-parser.js';
import { resolveDiningSnapshot } from '../lib/dining-hours-resolver.js';
import { makeValidDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

const html = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const evidence = () => ({
  nsop: parseNsopArticle(html('dining-nsop-2026.html')),
  labor: parseLaborDayArticle(html('dining-labor-day-2026.html')),
  fall: parseFallArticle(html('dining-fall-2026.html')),
  cafeEast: parseCafeEastPage(html('cafe-east-live.txt')),
});

function barnardEvidence() {
  return combineBarnardDiningWeeks(['2026-08-23', '2026-08-30', '2026-09-06']
    .map(date => parseBarnardRenderedWeek(html(`barnard-dining-hours-week-${date}.html`))));
}

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
  const cafeEast = result.locations.find(({ id }) => id === 'cafe-east');
  assert.equal(result.schemaVersion, 3);
  assert.deepEqual(cafeEast.days[0].intervals, [['10:30', '19:30']]);
  assert.equal(cafeEast.days[0].sourceId, 'cafe-east');
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
  assert.ok(result.locations
    .filter((location) => location.id !== 'cafe-east')
    .every((location) => location.days.every((day) => day.sourceId === 'unpublished')));
  assert.ok(result.locations
    .find((location) => location.id === 'cafe-east')
    .days.every((day) => day.sourceId === 'cafe-east'));
  assert.deepEqual(result.specialServices, []);
});

test('resolves four Barnard venues by date and preserves true source freshness', () => {
  const sourceFetchedAt = Object.fromEntries([
    'locations-feed', 'nsop-2026', 'labor-day-2026', 'fall-2026', 'cafe-east',
  ].map(id => [id, '2026-08-24T12:00:00.000Z']));
  sourceFetchedAt['barnard-hours'] = '2026-08-24T08:00:00.000Z';
  const result = resolveDiningSnapshot({
    baseSnapshot: snapshotStarting('2026-08-24'),
    ...evidence(),
    barnardHours: barnardEvidence(),
    sourceFetchedAt,
  });
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.locations.length, 21);
  assert.equal(result.sources.at(-1).fetchedAt, '2026-08-24T08:00:00.000Z');
  const liz = result.locations.find(({ id }) => id === 'lizs-place');
  assert.equal(liz.category, 'cafe');
  assert.deepEqual(liz.days.find(({ date }) => date === '2026-09-03').intervals, [
    ['08:00', '14:00'], ['16:00', '19:00'],
  ]);
  assert.ok(!result.locations.some(({ id }) => /lefrak|kosher/i.test(id)));
});

test('marks only Barnard dates outside retained coverage as unpublished', () => {
  const twoWeeks = combineBarnardDiningWeeks(['2026-08-23', '2026-08-30']
    .map(date => parseBarnardRenderedWeek(html(`barnard-dining-hours-week-${date}.html`))));
  const sourceFetchedAt = Object.fromEntries([
    'locations-feed', 'nsop-2026', 'labor-day-2026', 'fall-2026', 'cafe-east', 'barnard-hours',
  ].map(id => [id, '2026-08-24T12:00:00.000Z']));
  const result = resolveDiningSnapshot({
    baseSnapshot: snapshotStarting('2026-08-24'),
    ...evidence(),
    barnardHours: twoWeeks,
    sourceFetchedAt,
  });
  const hewitt = result.locations.find(({ id }) => id === 'hewitt');
  assert.equal(hewitt.days.at(-1).date, '2026-09-06');
  assert.deepEqual(hewitt.days.at(-1), {
    date: '2026-09-06', intervals: [], status: 'Hours not published', sourceId: 'unpublished',
  });
  assert.ok(hewitt.days.slice(0, -1).every(day => day.sourceId === 'barnard-hours'));
});
