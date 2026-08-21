import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { makeValidDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

const source = fs.readFileSync(new URL('../assets/dining-hours.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.LionHourDiningHours;

const LIVE_IDS = [
  'bj-everett', 'bj-butler', 'bj-uris', 'bj-mudd', 'chefdons', 'chefmikes',
  'facultyhouse', 'facultyhouse-4', 'ferris', 'gracedodge', 'jjs', 'johnjay',
  'johnnys', 'lenfest-cafe', 'smith-dining', 'facshack',
];
const STATIC_IDS = ['joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge'];

function venues() {
  return [
    ...LIVE_IDS.map((id) => ({ id, hours: { 5: [['01:00', '02:00']] }, note: `embedded-${id}` })),
    ...STATIC_IDS.map((id) => ({ id, hours: { 5: [['07:00', '19:00']] }, note: `static-${id}` })),
    { id: 'dodge', hours: { 5: [['06:00', '22:00']] } },
  ];
}

test('atomically overlays all sixteen live locations and preserves static cafés', async () => {
  const list = venues();
  const staticBefore = structuredClone(list.filter(({ id }) => STATIC_IDS.includes(id)));
  const dodgeBefore = structuredClone(list.at(-1));
  let renders = 0;
  let status;
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => makeValidDiningSnapshot() }),
    render: () => { renders += 1; },
    setStatus: (next) => { status = next; },
    today: '2026-08-21',
    now: new Date('2026-08-21T17:00:00Z'),
  });

  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 16);
  assert.equal(renders, 1);
  assert.equal(status.kind, 'partial');
  assert.equal(status.totalCount, 20);
  assert.deepEqual(Array.from(status.staticFallbackIds), STATIC_IDS);
  assert.deepEqual(list.filter(({ id }) => STATIC_IDS.includes(id)), staticBefore);
  assert.deepEqual(list.at(-1), dodgeBefore);
  assert.deepEqual(
    Array.from(list.find(({ id }) => id === 'johnjay').hours[5], (interval) => Array.from(interval)),
    [['08:00', '20:00']],
  );
});

test('preserves split intervals and exact per-day closure status', () => {
  const snapshot = makeValidDiningSnapshot();
  const ferris = snapshot.locations.find(({ id }) => id === 'ferris');
  ferris.days[0] = {
    date: '2026-08-21',
    intervals: [['10:00', '14:00'], ['16:00', '20:00']],
    status: 'Summer Hours',
  };
  const jjs = snapshot.locations.find(({ id }) => id === 'jjs');
  jjs.days[0] = { date: '2026-08-21', intervals: [], status: 'Closed for Summer' };

  const updates = api.buildUpdates(snapshot, venues(), '2026-08-21');
  assert.equal(updates.ok, true);
  const ferrisNext = updates.entries.find(([venue]) => venue.id === 'ferris')[1];
  assert.deepEqual(Array.from(ferrisNext.hours[5], (interval) => Array.from(interval)), [
    ['10:00', '14:00'], ['16:00', '20:00'],
  ]);
  const jjsNext = updates.entries.find(([venue]) => venue.id === 'jjs')[1];
  assert.equal(jjsNext.sourceStatuses[5], 'Closed for Summer');
});

test('keeps every embedded schedule when request or validation fails', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, json: async () => ({ schemaVersion: 1, locations: [] }) }),
  ]) {
    const list = venues();
    const before = structuredClone(list);
    let status;
    const result = await api.hydrate({
      venues: list,
      fetchImpl,
      render: () => assert.fail('invalid hydration must not render'),
      setStatus: (next) => { status = next; },
      today: '2026-08-21',
    });
    assert.equal(result.applied, false);
    assert.equal(status.kind, 'fallback');
    assert.deepEqual(list, before);
  }
});

test('marks a valid snapshot older than eight hours as stale', async () => {
  let status;
  await api.hydrate({
    venues: venues(),
    fetchImpl: async () => ({ ok: true, json: async () => makeValidDiningSnapshot() }),
    render() {},
    setStatus: (next) => { status = next; },
    today: '2026-08-21',
    now: new Date('2026-08-22T00:01:00Z'),
  });
  assert.equal(status.kind, 'stale');
});
