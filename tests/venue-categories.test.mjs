/**
 * A venue lists under its primary `cat` plus any secondary categories in
 * `alsoIn`. Cafe East is the first venue to use it: it is a dining venue
 * whose hours come from the dining scraper, and it also belongs among the
 * cafes. These tests pin both halves — the in-page filtering and the
 * generated SEO pages — so a future edit can't quietly drop one listing.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { loadVenues } from '../scripts/lib/venues.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appScript = scripts.find(script => script.includes('VENUES = ['));
if (!appScript) throw new Error('index.html does not contain the LionHour application script');

const testableScript = appScript.slice(appScript.indexOf('const CATEGORIES = [')).replace(
  /\/\* ── Events[\s\S]*/,
  `globalThis.venueCategoryTestApi = { VENUES, CATEGORIES, venueCats, venueInCat, venueMatchesSearch };`,
);
const sandbox = { Intl, window: {} };
vm.runInNewContext(testableScript, sandbox);
const api = sandbox.venueCategoryTestApi;

const venueById = id => api.VENUES.find(v => v.id === id);

// --- the venue itself ------------------------------------------------------

test('Cafe East is a dining venue that also lists under cafes', () => {
  const cafeEast = venueById('cafe-east');
  assert.equal(cafeEast.cat, 'dining', 'dining is its home category');
  // spread: arrays cross the vm realm boundary and aren't reference-equal
  assert.deepEqual([...cafeEast.alsoIn], ['cafe']);
});

// --- membership ------------------------------------------------------------

test('venueInCat matches the primary category and every secondary one', () => {
  const cafeEast = venueById('cafe-east');
  assert.ok(api.venueInCat(cafeEast, 'dining'));
  assert.ok(api.venueInCat(cafeEast, 'cafe'));
  assert.ok(!api.venueInCat(cafeEast, 'library'));
});

test('venues without alsoIn are unaffected', () => {
  const butler = venueById('butler');
  assert.equal(butler.alsoIn, undefined);
  assert.ok(api.venueInCat(butler, 'library'));
  assert.ok(!api.venueInCat(butler, 'cafe'));

  const ferris = venueById('ferris');
  assert.ok(api.venueInCat(ferris, 'dining'));
  assert.ok(!api.venueInCat(ferris, 'cafe'));
});

test('both the Dining and the Cafes section pick Cafe East up', () => {
  for (const cat of ['dining', 'cafe']) {
    const ids = api.VENUES.filter(v => api.venueInCat(v, cat)).map(v => v.id);
    assert.ok(ids.includes('cafe-east'), `missing from ${cat}`);
  }
});

test('venueCats lists the primary category first', () => {
  assert.deepEqual([...api.venueCats(venueById('cafe-east'))], ['dining', 'cafe']);
  assert.deepEqual([...api.venueCats(venueById('butler'))], ['library']);
});

test('search matches a venue by either of its category labels', () => {
  const cafeEast = venueById('cafe-east');
  assert.ok(api.venueMatchesSearch(cafeEast, 'dining'));
  assert.ok(api.venueMatchesSearch(cafeEast, 'cafes'));
});

// --- the field is well-formed everywhere -----------------------------------

test('every alsoIn entry names a real, non-"all" category', () => {
  const known = new Set(api.CATEGORIES.map(c => c.id).filter(id => id !== 'all'));
  for (const v of api.VENUES.filter(v => v.alsoIn)) {
    for (const cat of v.alsoIn) {
      assert.ok(known.has(cat), `${v.id}: alsoIn names unknown category '${cat}'`);
    }
    assert.ok(!v.alsoIn.includes(v.cat), `${v.id}: alsoIn repeats its primary cat`);
  }
});

// --- loader validation -----------------------------------------------------

const MARKER = 'const D = (mon, tue, wed, thu, fri, sat, sun)';

function venuesFrom(entry) {
  const dir = mkdtempSync(join(tmpdir(), 'lionhour-venues-'));
  writeFileSync(join(dir, 'index.html'), `<script>
${MARKER} => ({0:sun,1:mon,2:tue,3:wed,4:thu,5:fri,6:sat});
const VENUES = window.VENUES = [
  ${entry}
];
</script>`);
  return () => loadVenues(dir);
}

test('loadVenues accepts a well-formed alsoIn', () => {
  const venues = venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:['cafe'] },`)();
  assert.deepEqual([...venues[0].alsoIn], ['cafe']);
});

test('loadVenues rejects a malformed alsoIn', () => {
  assert.throws(venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:'cafe' },`), /alsoIn must be a non-empty array/);
  assert.throws(venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:[] },`), /alsoIn must be a non-empty array/);
  assert.throws(venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:[1] },`), /alsoIn entries must be category ids/);
  assert.throws(venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:['dining'] },`), /repeats the primary cat/);
  assert.throws(venuesFrom(`{ id:'x', name:'X', cat:'dining', alsoIn:['cafe','cafe'] },`), /alsoIn has duplicates/);
});

// --- generated output ------------------------------------------------------

const page = name => readFileSync(join(ROOT, 'hours', name), 'utf8');

test('Cafe East is listed on both category pages', () => {
  assert.match(page('dining.html'), /Cafe East/);
  assert.match(page('cafes.html'), /Cafe East/);
});

test('its own page belongs to its home category', () => {
  const own = page('cafe-east.html');
  assert.match(own, /Dining hall/);
  assert.match(own, /\/hours\/dining/);
});

test('the catalog carries alsoIn through to the generated module', () => {
  const cafeEast = loadVenues(ROOT).find(v => v.id === 'cafe-east');
  assert.deepEqual([...cafeEast.alsoIn], ['cafe']);
});
