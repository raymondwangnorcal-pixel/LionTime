import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  parseBarnardHours,
  parseColumbiaHours,
  parseColumbiaModifications,
} from '../lib/recreation-source-parser.js';

test('parses current Columbia facility and room schedules with date ranges', async () => {
  const html = await readFixture('recreation-columbia-hours.html');
  const evidence = parseColumbiaHours(html);

  assert.deepEqual(find(evidence, 'dodge').weeklyIntervals['1'], [['06:00', '23:00']]);
  assert.equal(find(evidence, 'dodge').effectiveStart, '2026-08-17');
  assert.equal(find(evidence, 'blue-gym').availabilityType, 'open-recreation');
  assert.notDeepEqual(find(evidence, 'blue-gym').weeklyIntervals, find(evidence, 'dodge').weeklyIntervals);
  assert.deepEqual(find(evidence, 'uris-pool').weeklyIntervals['1'], [
    ['07:00', '09:00'],
    ['17:00', '20:00'],
  ]);
});

test('parses specific closures, reasons, and maintenance without guessing', async () => {
  const html = await readFixture('recreation-columbia-modifications.html');
  const evidence = parseColumbiaModifications(html);

  assert.deepEqual(find(evidence, 'levien-gymnasium'), {
    targetId: 'levien-gymnasium',
    sourceId: 'columbiaModifications',
    priority: 1,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [],
    status: 'Closed for Athletics event',
    reason: 'Varsity practice',
    availabilityType: 'open-recreation',
    accessRestrictions: [],
    sourceUpdatedAt: null,
  });
  assert.equal(find(evidence, 'uris-pool').status, 'Closed for maintenance');
  assert.deepEqual(find(evidence, 'blue-gym').dateIntervals, [['16:00', '18:00']]);
  assert.equal(find(evidence, 'blue-gym').availabilityType, 'reservation-required');
});

test('keeps Barnard access restrictions separate from operating intervals', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const item = find(parseBarnardHours(html), 'barnard-fitness');

  assert.deepEqual(item.accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(item.weeklyIntervals['1'], [['07:00', '22:00']]);
  assert.equal(item.dateIntervals, null);
});

test('does not merge modification evidence into a Columbia baseline', async () => {
  const [hours, modifications] = await Promise.all([
    readFixture('recreation-columbia-hours.html'),
    readFixture('recreation-columbia-modifications.html'),
  ]);

  assert.equal(find(parseColumbiaHours(hours), 'blue-gym').status, null);
  assert.equal(find(parseColumbiaModifications(modifications), 'blue-gym').weeklyIntervals, null);
});

const readFixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function find(items, targetId) {
  const item = items.find(candidate => candidate.targetId === targetId);
  assert.ok(item, `missing evidence for ${targetId}`);
  return item;
}
