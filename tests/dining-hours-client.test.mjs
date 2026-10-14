import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  makeValidBarnardDiningSnapshot,
  makeValidDiningSnapshot,
  makeValidDiningSnapshotV2,
  makeValidDiningSnapshotV3,
  makeValidDiningSnapshotV4,
} from './helpers/dining-hours-fixture.mjs';

const source = fs.readFileSync(new URL('../assets/dining-hours.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.LionHourDiningHours;

const LIVE_IDS = [
  'bj-everett', 'bj-butler', 'bj-uris', 'bj-mudd', 'chefdons', 'chefmikes',
  'facultyhouse', 'facultyhouse-4', 'ferris', 'gracedodge', 'jjs', 'johnjay',
  'johnnys', 'lenfest-cafe', 'facshack',
];
const STATIC_IDS = ['joe-noco', 'joe-journalism', 'joe-dodge'];
const BARNARD_IDS = ['hewitt', 'diana-center-cafe', 'barnard-bubble-tea-sushi', 'lizs-place'];
const LEGACY_STATIC_IDS = ['joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge', ...BARNARD_IDS];

function venues() {
  return [
    ...LIVE_IDS.map((id) => ({ id, hours: { 5: [['01:00', '02:00']] }, note: `embedded-${id}` })),
    { id: 'cafe-east', hours: { 5: [['10:30', '19:30']] }, note: 'embedded-cafe-east' },
    ...STATIC_IDS.map((id) => ({ id, hours: { 5: [['07:00', '19:00']] }, note: `static-${id}` })),
    ...BARNARD_IDS.map((id) => ({
      id, hours: { 5: [] }, sourceStatuses: { 5: 'Hours load from official schedule' }, note: `pending-${id}`,
    })),
    { id: 'dodge', hours: { 5: [['06:00', '22:00']] } },
  ];
}

test('atomically overlays legacy live locations and preserves four static cafés', async () => {
  const list = venues();
  const staticBefore = structuredClone(list.filter(({ id }) => LEGACY_STATIC_IDS.includes(id)));
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
  assert.equal(result.updatedCount, 15);
  assert.equal(renders, 1);
  assert.equal(status.kind, 'partial');
  assert.equal(status.totalCount, 23);
  assert.deepEqual(Array.from(status.staticFallbackIds), LEGACY_STATIC_IDS);
  assert.deepEqual(list.filter(({ id }) => LEGACY_STATIC_IDS.includes(id)), staticBefore);
  assert.deepEqual(list.at(-1), dodgeBefore);
  assert.deepEqual(
    Array.from(list.find(({ id }) => id === 'johnjay').hours[5], (interval) => Array.from(interval)),
    [['08:00', '20:00']],
  );
});

test('overlays Café East from schema version 3 and preserves three Joe cafés', async () => {
  const list = venues();
  const joeBefore = structuredClone(list.filter(({ id }) => STATIC_IDS.includes(id)));
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => makeValidDiningSnapshotV3() }),
    render() {},
    today: '2026-08-21',
    now: new Date('2026-08-21T17:00:00Z'),
  });

  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 16);
  assert.equal(result.totalCount, 23);
  assert.deepEqual(Array.from(result.staticFallbackIds), [...STATIC_IDS, ...BARNARD_IDS]);
  assert.deepEqual(list.filter(({ id }) => STATIC_IDS.includes(id)), joeBefore);
  assert.deepEqual(
    Array.from(list.find(({ id }) => id === 'cafe-east').hours[5], interval => Array.from(interval)),
    [['10:30', '19:30']],
  );
  assert.equal(list.find(({ id }) => id === 'cafe-east').sourceIds[5], 'cafe-east');
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

test('hydrates fresh Barnard venues and reports twenty of twenty-three live', async () => {
  const list = venues();
  const snapshot = makeValidDiningSnapshotV4({ barnardFetchedAt: '2026-08-21T12:00:00.000Z' });
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => snapshot }),
    render() {},
    today: '2026-08-21',
    now: new Date('2026-08-21T17:00:00Z'),
  });
  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 20);
  assert.equal(result.totalCount, 23);
  assert.deepEqual(Array.from(result.staticFallbackIds), STATIC_IDS);
  assert.equal(list.find(({ id }) => id === 'lizs-place').diningFreshness, 'live');
});

test('hydrates retained Barnard hours independently over a legacy Dining snapshot', async () => {
  const list = venues();
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => makeValidDiningSnapshot() }),
    barnardFetchImpl: async () => ({
      ok: true,
      json: async () => makeValidBarnardDiningSnapshot({ generated: '2026-08-24T12:00:00.000Z' }),
    }),
    render() {},
    today: '2026-08-24',
    now: new Date('2026-08-24T17:00:00Z'),
  });

  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 19);
  assert.equal(result.totalCount, 23);
  assert.deepEqual(Array.from(result.staticFallbackIds), ['joe-noco', 'cafe-east', 'joe-journalism', 'joe-dodge']);
  assert.equal(result.barnardFetchedAt, '2026-08-24T12:00:00.000Z');
  assert.equal(list.find(({ id }) => id === 'hewitt').diningFreshness, 'live');
});

test('hydrates Barnard even when the combined Dining snapshot is unavailable', async () => {
  const list = venues();
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => { throw new Error('combined unavailable'); },
    barnardFetchImpl: async () => ({
      ok: true,
      json: async () => makeValidBarnardDiningSnapshot({ generated: '2026-08-24T12:00:00.000Z' }),
    }),
    render() {},
    today: '2026-08-24',
    now: new Date('2026-08-24T17:00:00Z'),
  });

  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 4);
  assert.equal(result.totalCount, 23);
  assert.equal(result.staticFallbackIds.length, 19);
  assert.equal(list.find(({ id }) => id === 'lizs-place').diningFreshness, 'live');
});

test('hydrates Barnard days partially and stops counting expired evidence as live', () => {
  const snapshot = makeValidDiningSnapshotV4({ barnardFetchedAt: '2026-08-20T12:00:00.000Z' });
  const hewitt = snapshot.locations.find(({ id }) => id === 'hewitt');
  hewitt.days[2] = {
    date: hewitt.days[2].date,
    intervals: [],
    status: 'Hours not published',
    sourceId: 'unpublished',
  };
  const updates = api.buildUpdates(snapshot, venues(), '2026-08-21', new Date('2026-08-21T17:00:01Z'));
  assert.equal(updates.ok, true);
  assert.equal(updates.updatedCount, 16);
  assert.equal(updates.totalCount, 23);
  assert.deepEqual(Array.from(updates.staticFallbackIds), [...STATIC_IDS, ...BARNARD_IDS]);
  const hewittNext = updates.entries.find(([venue]) => venue.id === 'hewitt')[1];
  assert.equal(hewittNext.diningFreshness, 'expired');
  assert.equal(hewittNext.sourceStatuses[0], 'Hours not published');
  assert.match(hewittNext.sourceNote, /may be outdated/);
});

test('uses exact eight-hour and twenty-four-hour Barnard freshness boundaries', () => {
  const snapshot = makeValidDiningSnapshotV4({ barnardFetchedAt: '2026-08-21T12:00:00.000Z' });
  const atEight = api.buildUpdates(snapshot, venues(), '2026-08-21', new Date('2026-08-21T20:00:00Z'));
  assert.equal(atEight.entries.find(([venue]) => venue.id === 'hewitt')[1].diningFreshness, 'live');
  const afterEight = api.buildUpdates(snapshot, venues(), '2026-08-21', new Date('2026-08-21T20:00:01Z'));
  assert.equal(afterEight.entries.find(([venue]) => venue.id === 'hewitt')[1].diningFreshness, 'stale');
  const atTwentyFour = api.buildUpdates(snapshot, venues(), '2026-08-21', new Date('2026-08-22T12:00:00Z'));
  assert.equal(atTwentyFour.entries.find(([venue]) => venue.id === 'hewitt')[1].diningFreshness, 'stale');
  const afterTwentyFour = api.buildUpdates(snapshot, venues(), '2026-08-21', new Date('2026-08-22T12:00:01Z'));
  assert.equal(afterTwentyFour.entries.find(([venue]) => venue.id === 'hewitt')[1].diningFreshness, 'expired');
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

test('hydrates version 2 provenance and restricted NSOP service separately', async () => {
  const list = venues();
  const snapshot = makeValidDiningSnapshotV2();
  const ferris = snapshot.locations.find(({ id }) => id === 'ferris');
  ferris.days[0].sourceId = 'labor-day-2026';
  ferris.days[0].status = 'Labor Day 2026 hours';
  let services;
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => snapshot }),
    render() {},
    setSpecialServices: (value) => { services = value; },
    today: '2026-08-21',
    now: new Date('2026-08-21T17:00:00Z'),
  });
  assert.equal(result.applied, true);
  assert.equal(services.length, 1);
  assert.equal(services[0].countsAsOpen, false);
  assert.equal(services[0].days[0].sessions[0].label, 'Coffee Bar');
  assert.equal(list.find(({ id }) => id === 'ferris').sourceIds[5], 'labor-day-2026');
});

test('rejects unsafe version 2 source and NSOP open-count claims atomically', async () => {
  for (const mutate of [
    (snapshot) => { snapshot.sources[0].url = 'https://example.com/hours'; },
    (snapshot) => { snapshot.specialServices[0].countsAsOpen = true; },
    (snapshot) => { snapshot.locations[0].days[0].sourceId = 'nsop-2026'; },
    (snapshot) => { snapshot.specialServices[0].days[0].sessions[0].unsafe = true; },
  ]) {
    const snapshot = makeValidDiningSnapshotV2();
    mutate(snapshot);
    const list = venues();
    const before = structuredClone(list);
    const result = await api.hydrate({
      venues: list,
      fetchImpl: async () => ({ ok: true, json: async () => snapshot }),
      render: () => assert.fail('invalid version 2 data must not render'),
      setSpecialServices: () => assert.fail('invalid version 2 data must not expose services'),
      today: '2026-08-21',
    });
    assert.equal(result.applied, false);
    assert.deepEqual(list, before);
  }
});

test('accepts a v5 snapshot and shows Fall Break hours and closures', async () => {
  const { createDiningHoursService } = await import('../lib/dining-hours-service.js');
  const { makeValidDiningAttemptBatch } = await import('./helpers/dining-hours-fixture.mjs');
  let stored = null;
  const service = createDiningHoursService({
    store: { async getSnapshot() { return stored; }, async putSnapshot(next) { stored = next; } },
    updateSecret: 'secret',
  });
  const batch = makeValidDiningAttemptBatch({ schemaVersion: 4, generated: '2026-10-28T16:00:00.000Z' });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: batch })).status, 204);
  const snapshot = (await service.handle({ method: 'GET' })).body;
  assert.equal(snapshot.schemaVersion, 5);
  const updates = api.buildUpdates(snapshot, venues(), '2026-10-29', new Date('2026-10-28T16:30:00Z'));
  assert.equal(updates.ok, true);
  const next = id => updates.entries.find(([venue]) => venue.id === id)[1];
  // 2026-10-31 is a Saturday (dow 6).
  assert.equal(JSON.stringify(next('ferris').hours[6]), JSON.stringify([['10:00', '19:00']]));
  assert.equal(next('johnjay').sourceStatuses[6], 'Closed');
  assert.equal(next('ferris').sourceStatuses[6], 'Fall Break 2026 hours');
  // today is inside the window, so the real previous day comes from the window itself.
  assert.equal(next('jjs').previousDayHours.dow, 3);
  const sameDay = api.buildUpdates(snapshot, venues(), '2026-10-28', new Date('2026-10-28T16:30:00Z'));
  const jjsSameDay = sameDay.entries.find(([venue]) => venue.id === 'jjs')[1];
  // ...and on the snapshot's own date it comes from v5's previousDay (Tuesday Oct 27).
  assert.equal(jjsSameDay.previousDayHours.dow, 2);
  assert.equal(JSON.stringify(jjsSameDay.previousDayHours.intervals),
    JSON.stringify(snapshot.locations.find(location => location.id === 'jjs').previousDay.intervals));
  // The fixture's Barnard weeks are from August, so only Barnard may fall back here.
  assert.ok(Array.from(updates.staticFallbackIds).every(id => [...STATIC_IDS, ...BARNARD_IDS].includes(id)));
});
