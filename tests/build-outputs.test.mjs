import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { loadVenues, hasWeeklyHours } from '../scripts/lib/venues.mjs';
import { buildCatalog } from '../scripts/generate-venue-catalog.mjs';
import { VENUE_CATALOG, VENUE_BY_ID, findVenues, venuesWithHours } from '../lib/venue-catalog.generated.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

test('every generated output matches the VENUES array in index.html', () => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('the committed catalog is exactly what the generator produces', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(VENUE_CATALOG)), buildCatalog(loadVenues(ROOT)));
});

test('catalog carries every venue with unique ids and its weekly hours when fixed', () => {
  const venues = loadVenues(ROOT);
  assert.equal(VENUE_CATALOG.length, venues.length);
  assert.equal(new Set(VENUE_CATALOG.map(v => v.id)).size, venues.length);
  for (const v of venues) {
    assert.equal(Boolean(VENUE_BY_ID[v.id].weeklyHours), hasWeeklyHours(v), v.id);
  }
  assert.equal(VENUE_BY_ID.milstein.weeklyHours, null); // live-only
  assert.deepEqual(VENUE_BY_ID.johnjay.weeklyHours[1], [['09:30', '21:00']]);
});

test('venuesWithHours excludes live-only venues and other categories', () => {
  const ids = venuesWithHours('dining').map(v => v.id);
  assert.ok(ids.includes('johnjay') && ids.includes('ferris'));
  assert.ok(!ids.includes('hewitt'), 'Hewitt loads live and has no fixed schedule');
  assert.ok(!ids.includes('butler'), 'libraries are not dining');
});

test('findVenues resolves ids, names, and short aliases, and surfaces ambiguity', () => {
  assert.deepEqual(findVenues('johnjay').map(v => v.id), ['johnjay']);
  assert.deepEqual(findVenues('Ferris Dining Hall').map(v => v.id), ['ferris']);
  assert.deepEqual(findVenues('noco').map(v => v.id).sort(), ['joe-noco', 'noco']);
  assert.deepEqual(findVenues('butler').map(v => v.id).sort(), ['bj-butler', 'butler']);
  assert.deepEqual(findVenues(''), []);
});
