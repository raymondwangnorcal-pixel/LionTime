import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DINING_LOCATION_MAP,
  buildDiningSnapshot,
  parseDiningNodes,
} from '../scripts/dining-hours-scraper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dining-nodes.json', import.meta.url), 'utf8'));

function closedPeriod(status = 'Closed for Summer') {
  return {
    date_from: 1787284800,
    date_to: 1788408000,
    displayed_hours: status,
    excluded: [],
    days: Object.fromEntries([
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ].map((day) => [`days_${day}`, []])),
  };
}

function completeDataset() {
  const byId = new Map(fixture.nodes.map((node) => [String(node.nid), node]));
  return {
    nodes: Object.entries(DINING_LOCATION_MAP).map(([sourceId, mapping]) => byId.get(sourceId) || {
      nid: sourceId,
      title: mapping.name,
      open_hours_fields: [closedPeriod()],
    }),
  };
}

test('parses the structured dining_nodes JSON string', () => {
  assert.deepEqual(parseDiningNodes(JSON.stringify(fixture)), fixture);
  assert.throws(() => parseDiningNodes('{bad json'), /valid JSON/);
});

test('maps all sixteen official source nodes in deterministic order', () => {
  assert.equal(Object.keys(DINING_LOCATION_MAP).length, 16);
  const snapshot = buildDiningSnapshot(completeDataset(), new Date('2026-08-21T12:00:00Z'));
  assert.equal(snapshot.locations.length, 16);
  assert.deepEqual(snapshot.locations.map(({ sourceId }) => sourceId), Object.keys(DINING_LOCATION_MAP));
});

test('builds fourteen Eastern dates and preserves statuses, exclusions, and split intervals', () => {
  const snapshot = buildDiningSnapshot(completeDataset(), new Date('2026-08-21T12:00:00Z'));
  assert.equal(snapshot.windowStart, '2026-08-21');
  assert.equal(snapshot.windowEnd, '2026-09-03');

  const johnJay = snapshot.locations.find(({ id }) => id === 'johnjay');
  assert.equal(johnJay.days.length, 14);
  assert.deepEqual(johnJay.days[0], {
    date: '2026-08-21', intervals: [], status: 'Summer Hours',
  });
  assert.deepEqual(johnJay.days[2], {
    date: '2026-08-23', intervals: [], status: 'Summer Hours',
  });

  const ferris = snapshot.locations.find(({ id }) => id === 'ferris');
  assert.deepEqual(ferris.days[2].intervals, [['10:00', '14:00'], ['16:00', '20:00']]);

  const jjs = snapshot.locations.find(({ id }) => id === 'jjs');
  assert.equal(jjs.days[0].status, 'Closed for Summer');
  assert.deepEqual(jjs.days[0].intervals, []);
});

test('preserves legitimate overnight intervals', () => {
  const dataset = completeDataset();
  const jjs = dataset.nodes.find(({ nid }) => String(nid) === '11');
  jjs.open_hours_fields[0].displayed_hours = 'Fall Hours';
  jjs.open_hours_fields[0].days.days_friday = [{ hours_from: '12:00', hours_to: '10:00' }];
  const snapshot = buildDiningSnapshot(dataset, new Date('2026-08-21T12:00:00Z'));
  assert.deepEqual(
    snapshot.locations.find(({ id }) => id === 'jjs').days[0].intervals,
    [['12:00', '10:00']],
  );
});

test('rejects missing official locations and malformed time values', () => {
  const missing = completeDataset();
  missing.nodes.pop();
  assert.throws(() => buildDiningSnapshot(missing, new Date('2026-08-21T12:00:00Z')), /missing source location/);

  const malformed = completeDataset();
  malformed.nodes[0].open_hours_fields[0].days.days_friday = [{ hours_from: '25:00', hours_to: '14:00' }];
  assert.throws(() => buildDiningSnapshot(malformed, new Date('2026-08-21T12:00:00Z')), /invalid dining time/);
});
