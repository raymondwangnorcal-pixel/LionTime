import assert from 'node:assert/strict';
import test from 'node:test';

import { checkJoeCoffee, compareJoeHours, parseJoeCafeHours } from '../lib/joe-coffee-check.js';

// Shape of Joe's Shopify location pages as read on 2026-11-10 (trimmed to the hours block).
const page = hours => `<html><body><h2>About the Cafe</h2><p>A valid Columbia University ID is required.</p>
<h3>Cafe Hours</h3><p>${hours}</p><p>Download the Joe App</p></body></html>`;
const NOCO = page('Monday - Friday: 7:00AM - 7:00PM<br>Saturday - Sunday: 9:00AM - 5:00PM');
const DODGE = page('Monday - Friday: 8:00AM - 6:00PM<br>Saturday - Sunday: CLOSED');

const nocoCatalog = {
  0: [['09:00', '17:00']], 1: [['07:00', '19:00']], 2: [['07:00', '19:00']], 3: [['07:00', '19:00']],
  4: [['07:00', '19:00']], 5: [['07:00', '19:00']], 6: [['09:00', '17:00']],
};

test('reads weekday and weekend ranges, including closed days', () => {
  assert.deepEqual(parseJoeCafeHours(NOCO), nocoCatalog);
  const dodge = parseJoeCafeHours(DODGE);
  assert.equal(dodge[0], null);
  assert.equal(dodge[6], null);
  assert.deepEqual(dodge[3], [['08:00', '18:00']]);
});

test('refuses a block that does not cover all seven days', () => {
  assert.equal(parseJoeCafeHours(page('Monday - Friday: 7:00AM - 7:00PM')), null);
  assert.equal(parseJoeCafeHours('<p>Hours: call us</p>'), null);
});

test('matching hours report nothing; changed hours report each differing day', () => {
  assert.deepEqual(compareJoeHours('joe-noco', parseJoeCafeHours(NOCO), nocoCatalog), []);
  const changed = parseJoeCafeHours(page('Monday - Friday: 7:00AM - 8:00PM<br>Saturday - Sunday: 9:00AM - 5:00PM'));
  const [finding] = compareJoeHours('joe-noco', changed, nocoCatalog);
  assert.equal(finding.kind, 'drift');
  assert.match(finding.detail, /Mon LionHour 07:00–19:00 vs Joe 07:00–20:00/);
  assert.match(finding.detail, /Fri LionHour 07:00–19:00 vs Joe 07:00–20:00/);
  assert.doesNotMatch(finding.detail, /Sat/);
});

test('an unreachable page is reported as unreadable, not as matching', async () => {
  const fetchImpl = async () => ({ ok: false, text: async () => '' });
  const { findings } = await checkJoeCoffee({}, { fetchImpl });
  assert.deepEqual(findings.map(finding => `${finding.kind}:${finding.id}`), [
    'unreadable:joe-noco', 'unreadable:joe-journalism', 'unreadable:joe-dodge',
  ]);
});
