import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  parseFallArticle,
  parseLaborDayArticle,
  parseNsopArticle,
} from '../lib/dining-article-parser.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses six restricted NSOP service dates without treating them as open venues', () => {
  const result = parseNsopArticle(fixture('dining-nsop-2026.html'));
  assert.equal(result.countsAsOpen, false);
  assert.equal(result.days.length, 6);
  assert.deepEqual(result.days[0].sessions, []);
  assert.deepEqual(result.days[1].sessions[0], {
    label: 'Coffee Bar', open: '08:00', close: '17:00',
  });
  assert.equal(result.days[4].status, 'CUID required');
});

test('rejects NSOP evidence without audience or CUID restrictions', () => {
  const source = fixture('dining-nsop-2026.html');
  assert.throws(
    () => parseNsopArticle(source.replace('incoming First-Year, Transfer, Combined Plan, and Exchange students', 'students')),
    /restricted audience/,
  );
  assert.throws(() => parseNsopArticle(source.replace('bring their CUIDs', 'check in')), /CUID rule/);
});

test('parses exact Labor Day venue exceptions without inferring omitted closures', () => {
  const result = parseLaborDayArticle(fixture('dining-labor-day-2026.html'));
  assert.equal(result.days.length, 4);
  assert.deepEqual(result.days[0].venues.ferris, [['09:00', '20:00']]);
  assert.equal(result.days[3].venues.chefmikes, undefined);
  assert.deepEqual(result.days[3].venues.jjs, [['12:00', '21:00']]);
});

test('rejects an unknown venue in the Labor Day schedule', () => {
  const source = fixture('dining-labor-day-2026.html').replace('Ferris Booth Commons', 'Mystery Hall');
  assert.throws(() => parseLaborDayArticle(source), /unknown dining venue/);
});

test('rejects a fifth Labor Day table', () => {
  const source = fixture('dining-labor-day-2026.html').replace(
    '\n</article>',
    '<div class="paragraph--type--table"><h3>Tuesday, September 8</h3><dl><dt>Dining Hall</dt><dd>Ferris Booth Commons</dd><dt>Operating Hours</dt><dd>9:00 AM - 8:00 PM</dd></dl></div>\n</article>',
  );
  assert.throws(() => parseLaborDayArticle(source), /September 4 through 7/);
});

test('parses all fifteen Fall baselines including split and overnight intervals', () => {
  const result = parseFallArticle(fixture('dining-fall-2026.html'));
  assert.equal(Object.keys(result.venues).length, 15);
  assert.deepEqual(result.venues.ferris['0'], [['10:00', '14:00'], ['16:00', '20:00']]);
  assert.deepEqual(result.venues.facultyhouse['1'], [['07:30', '14:30'], ['17:00', '21:00']]);
  assert.deepEqual(result.venues.jjs['2'], [['12:00', '10:00']]);
  assert.deepEqual(result.venues['bj-butler']['1'], [['08:00', '24:00']]);
  assert.deepEqual(result.venues['bj-everett']['5'], [['08:30', '14:00']]);
});

test('rejects Fall pages without the effective date or complete venue catalog', () => {
  const source = fixture('dining-fall-2026.html');
  assert.throws(() => parseFallArticle(source.replace('begin on Tuesday, September 8', 'begin later')), /effective date/);
  assert.throws(() => parseFallArticle(source.replace("<dl><dt>Dining Location</dt><dd>Chef Mike's Sub Shop", "<dl hidden><dt>Dining Location</dt><dd>Unknown")), /unknown dining venue/);
});

test('rejects a backwards non-overnight Fall interval', () => {
  const source = fixture('dining-fall-2026.html').replace(
    'Monday - Friday, 8 a.m. - 7 p.m.',
    'Monday - Friday, 8 p.m. - 7 p.m.',
  );
  assert.throws(() => parseFallArticle(source), /must increase/);
});
