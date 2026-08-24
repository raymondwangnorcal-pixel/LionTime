import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseCafeEastPage } from '../lib/cafe-east-parser.js';

const fixture = readFileSync(new URL('./fixtures/cafe-east-live.txt', import.meta.url), 'utf8');

test('parses the complete official Café East weekly schedule', () => {
  assert.deepEqual(parseCafeEastPage(fixture), {
    id: 'cafe-east',
    name: 'Café East',
    location: 'Lerner Hall, Room 2E',
    weekdays: {
      0: [['11:00', '19:30']],
      1: [['10:30', '19:30']],
      2: [['10:30', '19:30']],
      3: [['10:30', '19:30']],
      4: [['10:30', '19:30']],
      5: [['10:30', '19:30']],
      6: [['11:00', '19:30']],
    },
  });
});

test('rejects missing official identity and incomplete schedules', () => {
  assert.throws(() => parseCafeEastPage(fixture.replace('Location: 2E', 'Location: elsewhere')), /identity/);
  assert.throws(() => parseCafeEastPage(fixture.replace(/Saturday & Sunday.*\n/, '')), /weekend/);
});

test('rejects malformed and non-increasing time ranges', () => {
  assert.throws(() => parseCafeEastPage(fixture.replace('10:30 AM', '25:30 AM')), /invalid/);
  assert.throws(
    () => parseCafeEastPage(fixture.replace('10:30 AM - 7:30 PM', '10:30 AM - 7:30 AM')),
    /increase/,
  );
});
