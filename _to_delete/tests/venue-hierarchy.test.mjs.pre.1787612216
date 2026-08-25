import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const appScript = scripts.find(script => script.includes('const VENUES = ['));

if (!appScript) throw new Error('index.html does not contain the LionHour application script');

const start = appScript.indexOf('const CATEGORIES = [');
const testableScript = appScript.slice(start).replace(
  /\/\* ── Events[\s\S]*/,
  `globalThis.venueHierarchyTestApi = {
    VENUES,
    topLevelVenues: typeof topLevelVenues === 'function' ? topLevelVenues : () => VENUES,
    dodgeSpacesFor: typeof dodgeSpacesFor === 'function' ? dodgeSpacesFor : () => [],
    venueMatchesSearch: typeof venueMatchesSearch === 'function' ? venueMatchesSearch : () => false,
  };`,
);
const sandbox = { Intl, window: {} };
vm.runInNewContext(testableScript, sandbox);
const api = sandbox.venueHierarchyTestApi;

test('renders Uris Pool only through the Dodge hierarchy', () => {
  const topLevel = api.topLevelVenues();
  const fitnessIds = Array.from(topLevel.filter(venue => venue.cat === 'fitness'), venue => venue.id);

  assert.deepEqual(fitnessIds, ['dodge', 'barnard-fitness']);
  assert.equal(api.VENUES.find(venue => venue.id === 'uris-pool').parentId, 'dodge');
});

test('keeps embedded Uris Pool hours in Dodge before live hydration', () => {
  const dodge = api.VENUES.find(venue => venue.id === 'dodge');
  const spaces = api.dodgeSpacesFor(dodge, { dow: 1, mins: 15 * 60 });

  assert.deepEqual(Array.from(spaces, space => space.id), ['uris-pool']);
  assert.deepEqual(
    Array.from(spaces[0].intervals, interval => Array.from(interval)),
    [['12:00', '14:00'], ['19:00', '21:30']],
  );
  assert.equal(spaces[0].availabilityType, 'lap-swim');
});

test('finds Dodge when searching for its nested Uris Pool', () => {
  const dodge = api.VENUES.find(venue => venue.id === 'dodge');

  assert.equal(api.venueMatchesSearch(dodge, 'uris pool'), true);
});
