import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDiningMenusSnapshot } from '../lib/dining-menus-schema.js';

function makeValidSnapshot() {
  return {
    schemaVersion: 1,
    date: '2026-09-20',
    generated: '2026-09-20T07:25:08.489489-04:00',
    scrapedAt: '2026-09-20T07:25:08.489489-04:00',
    source: 'liondine.com',
    venues: {
      ferris: {
        meals: {
          breakfast: { name: 'Ferris', available: true, stations: [] },
          lunch: { name: 'Ferris', available: false, stations: [] },
        },
      },
    },
    unavailable: [],
  };
}

test('accepts a scraped snapshot', () => {
  const result = validateDiningMenusSnapshot(makeValidSnapshot());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, makeValidSnapshot());
});

test('requires the stamps the publish verification and the client rely on', () => {
  for (const [field, value] of [['schemaVersion', 2], ['generated', 'not a date'], ['date', '09/20/2026'], ['source', '']]) {
    const snapshot = { ...makeValidSnapshot(), [field]: value };
    assert.equal(validateDiningMenusSnapshot(snapshot).ok, false, `${field} should be rejected`);
  }
});

test('refuses a snapshot that would blank the menu tab', () => {
  const empty = { ...makeValidSnapshot(), venues: {} };
  assert.equal(validateDiningMenusSnapshot(empty).ok, false);

  // Every hall closed is a real day; no hall publishing any meal is a blind scrape.
  const noMeals = { ...makeValidSnapshot(), venues: { ferris: { meals: {} } } };
  const result = validateDiningMenusSnapshot(noMeals);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /refusing to replace the last good snapshot/);

  const allClosed = makeValidSnapshot();
  allClosed.venues.ferris.meals.breakfast.available = false;
  assert.equal(validateDiningMenusSnapshot(allClosed).ok, true);
});

test('rejects malformed venues and meals', () => {
  const badMeal = makeValidSnapshot();
  badMeal.venues.ferris.meals.brunch = { available: true };
  assert.equal(validateDiningMenusSnapshot(badMeal).ok, false);

  const badVenue = { ...makeValidSnapshot(), venues: { ferris: { meals: 'lunch' } } };
  assert.equal(validateDiningMenusSnapshot(badVenue).ok, false);
  assert.equal(validateDiningMenusSnapshot(null).ok, false);
});
