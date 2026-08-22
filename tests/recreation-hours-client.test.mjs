import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  validSnapshot,
  withoutFacility,
  withoutSpace,
  setDay,
  setSpaceDay,
} from './helpers/recreation-hours-fixture.mjs';

const source = fs.readFileSync(new URL('../assets/recreation-hours.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.LionHourRecreationHours;

function venueFixture() {
  return [
    {
      id: 'dodge',
      hours: { 5: [['05:00', '21:00']] },
      note: 'embedded Dodge',
    },
    {
      id: 'uris-pool',
      hours: { 5: [['07:00', '08:00']] },
      note: 'embedded pool',
    },
    {
      id: 'barnard-fitness',
      hours: { 5: [['06:00', '20:00']] },
      note: 'embedded Barnard',
    },
    { id: 'unrelated', hours: { 5: [['09:00', '17:00']] } },
  ];
}

function hydrateFixture({ responseStatus = 200, snapshot = validSnapshot(), ageHours = 0 } = {}) {
  const venues = venueFixture();
  let status;
  let renders = 0;
  const now = new Date(new Date(snapshot.generated).getTime() + ageHours * 60 * 60 * 1000);
  return api.hydrate({
    venues,
    fetchImpl: async () => ({
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      json: async () => snapshot,
    }),
    render: () => { renders += 1; },
    setStatus: next => { status = next; },
    today: '2026-08-21',
    now,
  }).then(result => ({ ...result, status, venues, renders }));
}

test('atomically overlays Dodge, Uris Pool, and Barnard', () => {
  const venues = venueFixture();
  const result = api.buildUpdates(validSnapshot(), venues, '2026-08-21');
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.entries.map(([venue]) => venue.id)), ['dodge', 'uris-pool', 'barnard-fitness']);
  assert.equal(result.entries.find(([venue]) => venue.id === 'dodge')[1].recreationSpaces.length, 5);
  assert.equal(result.entries.find(([venue]) => venue.id === 'dodge')[1].recreationLive, true);
});

test('rejects the whole overlay when one required facility or space is invalid', () => {
  assert.equal(api.buildUpdates(withoutFacility('barnard-fitness'), venueFixture(), '2026-08-21').ok, false);
  assert.equal(api.buildUpdates(withoutSpace('levien-gymnasium'), venueFixture(), '2026-08-21').ok, false);
});

test('fails closed on malformed provenance and unknown snapshot fields', () => {
  const malformed = validSnapshot();
  malformed.extra = true;
  malformed.facilities[0].days[0].sourceRefs = null;
  assert.doesNotThrow(() => api.buildUpdates(malformed, venueFixture(), '2026-08-21'));
  assert.equal(api.buildUpdates(malformed, venueFixture(), '2026-08-21').ok, false);
});

test('preserves split intervals, closures, reservations, verification, and access restrictions', () => {
  let snapshot = validSnapshot();
  snapshot = setDay(snapshot, 'uris-pool', {
    intervals: [['12:00', '14:00'], ['19:00', '21:30']],
    status: null,
    accessRestrictions: ['Columbia ID required'],
  });
  snapshot = setDay(snapshot, 'barnard-fitness', {
    intervals: [],
    status: 'Closed for maintenance',
    reason: 'Floor maintenance',
  });
  snapshot = setSpaceDay(snapshot, 'blue-gym', {
    intervals: [],
    status: 'Reservation required',
    reason: 'Reserve online',
    availabilityType: 'reservation-required',
  });
  const updates = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  assert.equal(updates.ok, true);
  const pool = updates.entries.find(([venue]) => venue.id === 'uris-pool')[1];
  assert.deepEqual(Array.from(pool.hours[5], interval => Array.from(interval)), [['12:00', '14:00'], ['19:00', '21:30']]);
  assert.deepEqual(Array.from(pool.accessRestrictions), ['Columbia ID required']);
  assert.equal(pool.sourceStatuses[5], null);
  const barnard = updates.entries.find(([venue]) => venue.id === 'barnard-fitness')[1];
  assert.equal(barnard.sourceStatuses[5], 'Closed for maintenance');
  const blueGym = updates.entries.find(([venue]) => venue.id === 'dodge')[1]
    .recreationSpaces.find(space => space.id === 'blue-gym');
  assert.equal(blueGym.status, 'Reservation required');
  assert.equal(blueGym.reason, 'Reserve online');
});

test('preserves embedded schedules and marks fallback when request or validation fails', async () => {
  for (const options of [
    { responseStatus: 503 },
    { snapshot: withoutFacility('dodge') },
  ]) {
    const result = await hydrateFixture(options);
    assert.equal(result.applied, false);
    assert.equal(result.status.kind, 'fallback');
    assert.equal(result.renders, 0);
    assert.deepEqual(result.venues, venueFixture());
  }
});

test('marks a valid snapshot older than eight hours as stale', async () => {
  const result = await hydrateFixture({ ageHours: 9 });
  assert.equal(result.applied, true);
  assert.equal(result.status.kind, 'stale');
});

test('reports verification when a current resolved state needs verification', async () => {
  const snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [],
    status: 'Hours need verification',
    sourceRefs: ['barnardFitness'],
    conflict: true,
  });
  const result = await hydrateFixture({ snapshot });
  assert.equal(result.applied, true);
  assert.equal(result.status.kind, 'verification');
  assert.equal(result.status.verificationCount > 0, true);
});

test('does not infer room hours from Dodge when room data is unavailable', () => {
  const snapshot = validSnapshot();
  const blueGym = snapshot.facilities.find(facility => facility.id === 'dodge').spaces
    .find(space => space.id === 'blue-gym');
  blueGym.days[0].intervals = [];
  blueGym.days[0].status = 'Separate hours not published';
  blueGym.days[0].reason = null;
  blueGym.days[0].sourceRefs = [];
  blueGym.days[0].conflict = false;
  blueGym.days[0].availabilityType = null;
  const result = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  assert.equal(result.ok, true);
  const blueGymUpdate = result.entries.find(([venue]) => venue.id === 'dodge')[1]
    .recreationSpaces.find(space => space.id === 'blue-gym');
  assert.deepEqual(blueGymUpdate.intervals, []);
  assert.equal(blueGymUpdate.status, 'Separate hours not published');
});
