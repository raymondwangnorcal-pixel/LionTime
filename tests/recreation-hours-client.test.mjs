import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  conflictingBlueGymA,
  conflictingBlueGymB,
  dodgeMaintenance,
  evidence,
  openDodge,
  resolveWith,
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

function officialize(snapshot) {
  const officialSourceFor = (sourceId, targetId) => {
    if (targetId === 'barnard-fitness') return 'barnardFitness';
    return /modification|maintenance|reservation|blue-b/.test(sourceId)
      ? 'columbiaModifications'
      : 'columbiaHours';
  };
  const officializeDay = day => {
    day.evidenceRefs = [...new Set(day.evidenceRefs.map(ref => {
      const separator = ref.indexOf(':');
      const sourceId = ref.slice(0, separator);
      const targetId = ref.slice(separator + 1);
      return `${officialSourceFor(sourceId, targetId)}:${targetId}`;
    }))].sort();
    day.sourceRefs = [...new Set(day.evidenceRefs.map(ref => ref.slice(0, ref.indexOf(':'))))].sort();
    for (const restriction of day.restrictions) {
      restriction.evidenceRefs = [...new Set(restriction.evidenceRefs.map(ref => {
        const separator = ref.indexOf(':');
        const sourceId = ref.slice(0, separator);
        const targetId = ref.slice(separator + 1);
        return `${officialSourceFor(sourceId, targetId)}:${targetId}`;
      }))].sort();
      restriction.sourceRefs = [...new Set(restriction.evidenceRefs.map(ref => ref.slice(0, ref.indexOf(':'))))].sort();
    }
  };
  for (const facility of snapshot.facilities) {
    for (const day of facility.days) officializeDay(day);
    for (const space of facility.spaces || []) {
      for (const day of space.days) officializeDay(day);
    }
  }
  return snapshot;
}

function resolverBaselineEvidence() {
  return [
    openDodge,
    evidence({ targetId: 'uris-pool', sourceId: 'pool-baseline', availabilityType: 'lap-swim' }),
    evidence({ targetId: 'barnard-fitness', sourceId: 'barnard-baseline' }),
    ...[
      'blue-gym', 'levien-gymnasium', 'functional-fitness-studio', 'aerobics-room-4', 'squash-courts',
    ].map(targetId => evidence({ targetId, sourceId: `${targetId}-baseline`, availabilityType: 'open-recreation' })),
  ];
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

test('fails closed without throwing for non-string evidence identities', () => {
  const malformed = validSnapshot();
  malformed.facilities[0].days[0].evidenceRefs = [null];

  let result;
  assert.doesNotThrow(() => {
    result = api.buildUpdates(malformed, venueFixture(), '2026-08-21');
  });
  assert.equal(result.ok, false);
});

test('rejects parent or peer evidence identity copied onto a Dodge space', () => {
  const parentOnly = setSpaceDay(validSnapshot(), 'blue-gym', {
    evidenceRefs: ['columbiaHours:dodge'],
  });
  const peerOnly = setSpaceDay(validSnapshot(), 'blue-gym', {
    evidenceRefs: ['columbiaHours:levien-gymnasium'],
  });

  for (const snapshot of [parentOnly, peerOnly]) {
    const result = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
    assert.equal(result.ok, false);
    assert.match(Array.from(result.errors).join('\n'), /target-specific evidence/i);
  }
});

test('preserves explicit restriction windows through client hydration', () => {
  const restriction = {
    targetId: 'barnard-fitness',
    intervals: [['12:00', '14:00']],
    status: 'Reservation required',
    reason: 'Private reservation',
    availabilityType: 'reservation-required',
    accessRestrictions: [],
    sourceRefs: ['barnardFitness'],
    evidenceRefs: ['barnardFitness:barnard-fitness'],
  };
  const snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [['06:00', '12:00'], ['14:00', '23:00']],
    restrictions: [restriction],
  });

  const updates = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  assert.equal(updates.ok, true);
  const barnard = updates.entries.find(([venue]) => venue.id === 'barnard-fitness')[1];
  assert.deepEqual(Array.from(barnard.sourceRestrictions[5][0].intervals[0]), ['12:00', '14:00']);
  assert.equal(barnard.recreationCurrent.restrictions[0].status, 'Reservation required');
  assert.deepEqual(Array.from(barnard.recreationCurrent.evidenceRefs), ['barnardFitness:barnard-fitness']);

  const invalid = setDay(snapshot, 'barnard-fitness', {
    restrictions: [{ ...restriction, status: 'Closed for dragons' }],
  });
  const rejected = api.buildUpdates(invalid, venueFixture(), '2026-08-21');
  assert.equal(rejected.ok, false);
  assert.match(Array.from(rejected.errors).join('\n'), /approved restriction status/i);
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

test('returns a stable status-error when fallback status reporting throws', async () => {
  const failures = [
    { responseStatus: 503, expectedFailure: 'http-503' },
    { snapshot: withoutFacility('dodge'), expectedFailure: 'invalid-data' },
  ];
  for (const options of failures) {
    const venues = venueFixture();
    let externalStatus = 'embedded';
    const result = await api.hydrate({
      venues,
      fetchImpl: async () => ({
        ok: options.responseStatus ? false : true,
        status: options.responseStatus || 200,
        json: async () => options.snapshot,
      }),
      render: () => assert.fail('fallback must not render'),
      setStatus: () => { externalStatus = 'fallback-partial'; throw new Error('fallback-status-boom'); },
      today: '2026-08-21',
      now: new Date('2026-08-21T20:00:00Z'),
    });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'status-error');
    assert.equal(result.failureReason, options.expectedFailure);
    assert.equal(result.statusError, 'fallback-status-boom');
    assert.equal(externalStatus, 'fallback-partial');
    assert.deepEqual(venues, venueFixture());
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

test('counts an unpublished Dodge space in the verification footer state', async () => {
  const snapshot = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [],
    status: 'Separate hours not published',
    reason: null,
    availabilityType: null,
    sourceRefs: [],
    evidenceRefs: [],
    restrictions: [],
    conflict: false,
  });
  const result = await hydrateFixture({ snapshot });

  assert.equal(result.status.kind, 'verification');
  assert.ok(Array.from(result.status.verificationIds).includes('blue-gym'));
});

test('does not infer room hours from Dodge when room data is unavailable', () => {
  const snapshot = validSnapshot();
  const blueGym = snapshot.facilities.find(facility => facility.id === 'dodge').spaces
    .find(space => space.id === 'blue-gym');
  blueGym.days[0].intervals = [];
  blueGym.days[0].status = 'Separate hours not published';
  blueGym.days[0].reason = null;
  blueGym.days[0].sourceRefs = [];
  blueGym.days[0].evidenceRefs = [];
  blueGym.days[0].restrictions = [];
  blueGym.days[0].conflict = false;
  blueGym.days[0].availabilityType = null;
  const result = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  assert.equal(result.ok, true);
  const blueGymUpdate = result.entries.find(([venue]) => venue.id === 'dodge')[1]
    .recreationSpaces.find(space => space.id === 'blue-gym');
  assert.deepEqual(blueGymUpdate.intervals, []);
  assert.equal(blueGymUpdate.status, 'Separate hours not published');
});

test('accepts and hydrates resolver-generated maintenance closure with inherited conflict', async () => {
  const snapshot = officialize(resolveWith([
    ...resolverBaselineEvidence(), dodgeMaintenance, conflictingBlueGymA, conflictingBlueGymB,
  ]));
  const blueGym = snapshot.facilities.find(facility => facility.id === 'dodge').spaces
    .find(space => space.id === 'blue-gym').days[0];
  assert.equal(blueGym.status, 'Closed for maintenance');
  assert.equal(blueGym.conflict, true);
  assert.equal(api.buildUpdates(snapshot, venueFixture(), '2026-08-21').ok, true);
  const result = await hydrateFixture({ snapshot });
  assert.equal(result.applied, true);
});

test('accepts and hydrates resolver-generated all-day reservation inheritance', async () => {
  const reservation = evidence({
    targetId: 'dodge',
    sourceId: 'dodge-reservation',
    priority: 1,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [],
    status: 'Reservation required',
    availabilityType: 'reservation-required',
    reason: 'Reserve the facility',
  });
  const snapshot = officialize(resolveWith([...resolverBaselineEvidence(), reservation]));
  const poolDay = snapshot.facilities.find(facility => facility.id === 'uris-pool').days[0];
  assert.equal(poolDay.status, 'Reservation required');
  assert.equal(poolDay.availabilityType, 'lap-swim');
  assert.equal(api.buildUpdates(snapshot, venueFixture(), '2026-08-21').ok, true);
  const result = await hydrateFixture({ snapshot });
  assert.equal(result.applied, true);
});

test('rolls back every venue when a later target cannot accept updates', async () => {
  const venues = venueFixture();
  Object.preventExtensions(venues[1]);
  const original = structuredClone(venues);
  let status;
  const result = await api.hydrate({
    venues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => assert.fail('preflight failure must not render'),
    setStatus: next => { status = next; },
    today: '2026-08-21',
    now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(result.applied, false);
  assert.equal(status.kind, 'fallback');
  assert.deepEqual(venues, original);
});

test('returns a stable status-error for preflight and mid-apply failures', async () => {
  const preflightVenues = venueFixture();
  Object.preventExtensions(preflightVenues[1]);
  const preflight = await api.hydrate({
    venues: preflightVenues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => assert.fail('preflight failure must not render'),
    setStatus: () => { throw new Error('preflight-status-boom'); },
    today: '2026-08-21', now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(preflight.reason, 'status-error');
  assert.equal(preflight.failureReason, 'venue-update-failed');
  assert.equal(preflight.statusError, 'preflight-status-boom');

  const applyVenues = venueFixture();
  const applyTarget = applyVenues[1];
  applyVenues[1] = new Proxy(applyTarget, {
    defineProperty() { throw new Error('apply-boom'); },
  });
  const apply = await api.hydrate({
    venues: applyVenues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => assert.fail('apply failure must not render'),
    setStatus: () => { throw new Error('apply-status-boom'); },
    today: '2026-08-21', now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(apply.reason, 'status-error');
  assert.equal(apply.failureReason, 'venue-update-failed');
  assert.equal(apply.statusError, 'apply-status-boom');
  assert.deepEqual(applyTarget, venueFixture()[1]);
});

test('rolls back venue updates when rendering fails without reporting request fallback', async () => {
  const venues = venueFixture();
  const original = structuredClone(venues);
  let externalView = 'embedded';
  let status;
  const result = await api.hydrate({
    venues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => { externalView = 'live'; throw new Error('render exploded'); },
    restore: () => { externalView = 'embedded'; },
    setStatus: next => { status = next; },
    today: '2026-08-21',
    now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'render-error');
  assert.equal(status, undefined);
  assert.equal(externalView, 'embedded');
  assert.deepEqual(venues, original);
});

test('does not relabel a post-commit status callback failure as fallback', async () => {
  const venues = venueFixture();
  let externalView = 'embedded';
  const result = await api.hydrate({
    venues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => { externalView = 'live'; },
    setStatus: () => { externalView = 'live-status'; throw new Error('status exploded'); },
    today: '2026-08-21',
    now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(result.applied, true);
  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'status-error');
  assert.equal(externalView, 'live-status');
  assert.equal(venues[0].recreationLive, true);
});

test('distinguishes restoration failure after renderer failure', async () => {
  const venues = venueFixture();
  const result = await api.hydrate({
    venues,
    fetchImpl: async () => ({ ok: true, json: async () => validSnapshot() }),
    render: () => { throw new Error('render exploded'); },
    restore: () => { throw new Error('restore exploded'); },
    setStatus: () => assert.fail('renderer failure must not publish status'),
    today: '2026-08-21', now: new Date('2026-08-21T20:00:00Z'),
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'rollback-error');
  assert.equal(result.failureReason, 'render-error');
  assert.equal(result.restorationError, 'restore exploded');
});

test('preserves structured top-level reasons, swim modes, reservations, access, and conflicts', () => {
  let snapshot = validSnapshot();
  snapshot = setDay(snapshot, 'uris-pool', {
    reason: 'Recreational swimmers only after 7 PM',
    availabilityType: 'recreation-swim',
    accessRestrictions: ['Columbia ID required'],
  });
  snapshot = setDay(snapshot, 'barnard-fitness', {
    intervals: [],
    status: 'Closed for maintenance',
    reason: 'Floor maintenance',
  });
  let updates = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  assert.equal(updates.ok, true);
  let pool = updates.entries.find(([venue]) => venue.id === 'uris-pool')[1];
  assert.equal(pool.recreationDays[5].reason, 'Recreational swimmers only after 7 PM');
  assert.equal(pool.recreationDays[5].availabilityType, 'recreation-swim');
  assert.deepEqual(Array.from(pool.recreationDays[5].accessRestrictions), ['Columbia ID required']);
  const barnard = updates.entries.find(([venue]) => venue.id === 'barnard-fitness')[1];
  assert.equal(barnard.recreationCurrent.reason, 'Floor maintenance');
  assert.equal(barnard.recreationCurrent.status, 'Closed for maintenance');

  snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [], status: 'Reservation required', availabilityType: 'reservation-required',
    reason: 'Reserve online', accessRestrictions: ['Barnard ID required'],
  });
  updates = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  const reservation = updates.entries.find(([venue]) => venue.id === 'barnard-fitness')[1];
  assert.equal(reservation.recreationCurrent.availabilityType, 'reservation-required');
  assert.deepEqual(Array.from(reservation.accessRestrictions), ['Barnard ID required']);

  snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [], status: 'Hours need verification', sourceRefs: ['barnardFitness'], conflict: true,
  });
  updates = api.buildUpdates(snapshot, venueFixture(), '2026-08-21');
  const conflict = updates.entries.find(([venue]) => venue.id === 'barnard-fitness')[1];
  assert.equal(conflict.recreationCurrent.conflict, true);
  assert.equal(conflict.recreationCurrent.status, 'Hours need verification');
});
