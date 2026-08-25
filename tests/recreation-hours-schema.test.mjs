import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRecreationHoursSnapshot } from '../lib/recreation-hours-schema.js';
import { resolveRecreationSnapshot } from '../lib/recreation-hours-resolver.js';
import {
  evidence,
  generated,
  setDay,
  setSpaceDay,
  validSnapshot,
  withoutFacility,
  withoutSpace,
  withSource,
} from './helpers/recreation-hours-fixture.mjs';

const SPACE_IDS = [
  'blue-gym',
  'levien-gymnasium',
  'functional-fitness-studio',
  'aerobics-room-4',
  'squash-courts',
];

function resolverSnapshotWithOfficialSources(items = [], snapshotGenerated = generated) {
  return resolveRecreationSnapshot({
    generated: snapshotGenerated,
    evidence: [
      evidence({ sourceId: 'columbiaHours' }),
      evidence({ targetId: 'uris-pool', sourceId: 'columbiaHours', availabilityType: 'lap-swim' }),
      evidence({ targetId: 'barnard-fitness', sourceId: 'barnardFitness' }),
      ...SPACE_IDS.map(targetId => evidence({
        targetId, sourceId: 'columbiaHours', availabilityType: 'open-recreation',
      })),
      ...items,
    ],
  });
}

test('accepts the complete fourteen-day recreation snapshot', () => {
  assert.equal(validateRecreationHoursSnapshot(validSnapshot()).ok, true);
});

test('accepts the bounded Barnard manual-override provenance only for Barnard Fitness', () => {
  const barnardOverride = resolverSnapshotWithOfficialSources([evidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnardManualOverride',
    priority: 0,
    effectiveStart: '2026-08-24',
    effectiveEnd: '2026-08-24',
    weeklyIntervals: null,
    dateIntervals: [],
    status: 'Closed',
    accessRestrictions: ['Barnard students, faculty, and staff'],
  })], new Date('2026-08-24T12:00:00-04:00'));
  assert.equal(validateRecreationHoursSnapshot(barnardOverride).ok, true);

  const preStart = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [],
    status: 'Closed',
    availabilityType: 'facility-hours',
    accessRestrictions: ['Barnard students, faculty, and staff'],
    sourceRefs: ['barnardManualOverride'],
    evidenceRefs: ['barnardManualOverride:barnard-fitness'],
  });
  const preStartResult = validateRecreationHoursSnapshot(preStart);
  assert.equal(preStartResult.ok, false);
  assert.match(preStartResult.errors.join('\n'), /outside its approved schedule/i);

  const afterExpiry = setDay(
    resolverSnapshotWithOfficialSources([], new Date('2026-09-08T12:00:00-04:00')),
    'barnard-fitness',
    {
      intervals: [['09:00', '19:00']],
      status: null,
      availabilityType: 'facility-hours',
      accessRestrictions: ['Barnard students, faculty, and staff'],
      sourceRefs: ['barnardManualOverride'],
      evidenceRefs: ['barnardManualOverride:barnard-fitness'],
    },
  );
  const afterExpiryResult = validateRecreationHoursSnapshot(afterExpiry);
  assert.equal(afterExpiryResult.ok, false);
  assert.match(afterExpiryResult.errors.join('\n'), /outside its approved schedule/i);

  const wrongPayload = structuredClone(barnardOverride);
  const manualDay = wrongPayload.facilities.find(facility => facility.id === 'barnard-fitness').days[0];
  manualDay.accessRestrictions = [];
  const wrongPayloadResult = validateRecreationHoursSnapshot(wrongPayload);
  assert.equal(wrongPayloadResult.ok, false);
  assert.match(wrongPayloadResult.errors.join('\n'), /outside its approved schedule/i);

  const wrongTarget = setDay(validSnapshot(), 'dodge', {
    sourceRefs: ['barnardManualOverride'],
    evidenceRefs: ['barnardManualOverride:dodge'],
  });
  assert.match(validateRecreationHoursSnapshot(wrongTarget).errors.join('\n'), /not allowed for dodge/);
});

test('accepts explicit timed restrictions only when residual intervals exclude their windows', () => {
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
  const valid = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [['06:00', '12:00'], ['14:00', '23:00']],
    sourceRefs: ['barnardFitness'],
    evidenceRefs: ['barnardFitness:barnard-fitness'],
    restrictions: [restriction],
  });
  assert.equal(validateRecreationHoursSnapshot(valid).ok, true);

  const overlapping = setDay(valid, 'barnard-fitness', {
    intervals: [['06:00', '23:00']],
  });
  assert.match(validateRecreationHoursSnapshot(overlapping).errors.join('\n'), /restriction.*overlap|residual.*restriction/i);

  const unsupportedStatus = setDay(valid, 'barnard-fitness', {
    restrictions: [{ ...restriction, status: 'Closed for dragons' }],
  });
  assert.match(validateRecreationHoursSnapshot(unsupportedStatus).errors.join('\n'), /approved restriction status/i);

  const overlappingRestrictions = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [['06:00', '10:00'], ['16:00', '23:00']],
    restrictions: [
      { ...restriction, intervals: [['10:00', '14:00']] },
      { ...restriction, intervals: [['12:00', '16:00']], reason: 'Second reservation' },
    ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });
  assert.match(
    validateRecreationHoursSnapshot(overlappingRestrictions).errors.join('\n'),
    /restriction windows must not overlap each other/i,
  );
});

test('rejects copied parent or peer hours without target-specific evidence identity', () => {
  const parentOnly = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [['06:00', '23:00']],
    sourceRefs: ['columbiaHours'],
    evidenceRefs: ['columbiaHours:dodge'],
  });
  assert.match(validateRecreationHoursSnapshot(parentOnly).errors.join('\n'), /target-specific evidence/i);

  const peerOnly = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [['06:00', '23:00']],
    sourceRefs: ['columbiaHours'],
    evidenceRefs: ['columbiaHours:levien-gymnasium'],
  });
  assert.match(validateRecreationHoursSnapshot(peerOnly).errors.join('\n'), /target-specific evidence/i);

  const independentIdentical = validSnapshot();
  assert.deepEqual(
    independentIdentical.facilities.find(item => item.id === 'dodge').days[0].intervals,
    independentIdentical.facilities.find(item => item.id === 'dodge').spaces[0].days[0].intervals,
  );
  assert.equal(validateRecreationHoursSnapshot(independentIdentical).ok, true);
});

test('accepts resolver-generated Dodge restriction clipping with parent and child evidence', () => {
  const snapshot = resolverSnapshotWithOfficialSources([evidence({
    sourceId: 'columbiaModifications', priority: 1,
    effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21',
    weeklyIntervals: null, dateIntervals: [['12:00', '14:00']],
    status: 'Closed for maintenance', reason: 'Annual maintenance',
  })]);

  assert.equal(validateRecreationHoursSnapshot(snapshot).ok, true);
  const blue = snapshot.facilities.find(item => item.id === 'dodge').spaces[0].days[0];
  assert.equal(blue.restrictions[0].targetId, 'dodge');
  assert.ok(blue.evidenceRefs.includes('columbiaHours:blue-gym'));
  assert.ok(blue.evidenceRefs.includes('columbiaModifications:dodge'));
});

test('accepts the resolver closure-plus-conflict state inherited from Dodge', () => {
  const snapshot = resolverSnapshotWithOfficialSources([
    evidence({
      sourceId: 'columbiaModifications', priority: 1,
      effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21',
      weeklyIntervals: null, dateIntervals: [], status: 'Closed for maintenance', reason: 'Repairs',
    }),
    evidence({
      targetId: 'blue-gym', sourceId: 'columbiaHours', priority: 2,
      weeklyIntervals: { 5: [['10:00', '12:00']] }, availabilityType: 'open-recreation',
    }),
    evidence({
      targetId: 'blue-gym', sourceId: 'columbiaModifications', priority: 2,
      weeklyIntervals: { 5: [['14:00', '16:00']] }, availabilityType: 'open-recreation',
    }),
  ]);
  const blue = snapshot.facilities.find(facility => facility.id === 'dodge').spaces[0].days[0];
  assert.deepEqual(blue, {
    date: '2026-08-21', intervals: [], status: 'Closed for maintenance', reason: 'Repairs',
    availabilityType: null, accessRestrictions: [],
    sourceRefs: ['columbiaHours', 'columbiaModifications'],
    evidenceRefs: [
      'columbiaHours:blue-gym',
      'columbiaHours:dodge',
      'columbiaModifications:blue-gym',
      'columbiaModifications:dodge',
    ],
    restrictions: [], conflict: true,
  });
  assert.equal(validateRecreationHoursSnapshot(snapshot).ok, true);
});

test('accepts resolver reservation-required availability without a redundant status', () => {
  const snapshot = resolverSnapshotWithOfficialSources([
    evidence({
      targetId: 'blue-gym', sourceId: 'columbiaHours', priority: 2,
      weeklyIntervals: { 5: [['10:00', '12:00']] }, availabilityType: 'reservation-required',
    }),
  ]);
  const blue = snapshot.facilities.find(facility => facility.id === 'dodge').spaces[0].days[0];
  assert.deepEqual(blue.intervals, [['10:00', '12:00']]);
  assert.equal(blue.status, null);
  assert.equal(blue.availabilityType, 'reservation-required');
  assert.equal(validateRecreationHoursSnapshot(snapshot).ok, true);
});

test('accepts exact full-window Dodge reservation restrictions while preserving child availability', () => {
  const snapshot = resolverSnapshotWithOfficialSources([
    evidence({
      sourceId: 'columbiaModifications', priority: 1,
      effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21',
      weeklyIntervals: null, dateIntervals: [['06:00', '23:00']],
      status: 'Reservation required', reason: 'Private event', availabilityType: 'reservation-required',
    }),
  ]);
  const dodge = snapshot.facilities.find(facility => facility.id === 'dodge');
  const pool = snapshot.facilities.find(facility => facility.id === 'uris-pool');
  const expectedRestriction = {
    targetId: 'dodge', intervals: [['06:00', '23:00']], status: 'Reservation required',
    reason: 'Private event', availabilityType: 'reservation-required', accessRestrictions: [],
    sourceRefs: ['columbiaModifications'], evidenceRefs: ['columbiaModifications:dodge'],
  };
  assert.deepEqual(dodge.days[0].intervals, []);
  assert.equal(dodge.days[0].status, null);
  assert.equal(dodge.days[0].availabilityType, 'facility-hours');
  assert.deepEqual(dodge.days[0].restrictions, [expectedRestriction]);
  for (const [id, availabilityType] of [
    ['uris-pool', 'lap-swim'],
    ...SPACE_IDS.map(id => [id, 'open-recreation']),
  ]) {
    const day = id === 'uris-pool'
      ? pool.days[0]
      : dodge.spaces.find(space => space.id === id).days[0];
    assert.deepEqual(day.intervals, []);
    assert.equal(day.status, null);
    assert.equal(day.availabilityType, availabilityType);
    assert.deepEqual(day.restrictions, [expectedRestriction]);
  }
  assert.equal(validateRecreationHoursSnapshot(snapshot).ok, true);
});

test('rejects missing facilities, spaces, and untrusted sources', () => {
  assert.match(validateRecreationHoursSnapshot(withoutFacility('barnard-fitness')).errors.join('\n'), /missing required facility/);
  assert.match(validateRecreationHoursSnapshot(withoutSpace('blue-gym')).errors.join('\n'), /missing required Dodge space/);
  assert.match(validateRecreationHoursSnapshot(withSource('https://example.com')).errors.join('\n'), /official source/);
});

test('rejects pool states that violate the Dodge parent closure', () => {
  let snapshot = validSnapshot();
  snapshot = setDay(snapshot, 'dodge', { intervals: [], status: 'Closed' });
  snapshot = setDay(snapshot, 'uris-pool', { intervals: [['12:00', '14:00']], status: null });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /pool cannot open while Dodge is closed/);
});

test('rejects Dodge-space availability outside Dodge intervals', () => {
  let snapshot = setDay(validSnapshot(), 'dodge', { intervals: [['06:00', '10:00']] });
  snapshot = setSpaceDay(snapshot, 'blue-gym', { intervals: [['12:00', '14:00']] });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /blue-gym.*within Dodge hours/);
});

test('requires Dodge maintenance closure details to propagate to the pool and spaces', () => {
  let snapshot = setDay(validSnapshot(), 'dodge', {
    intervals: [], status: 'Closed for maintenance', reason: 'Repairs',
    sourceRefs: ['columbiaHours', 'columbiaModifications'],
    evidenceRefs: ['columbiaHours:dodge', 'columbiaModifications:dodge'],
  });
  snapshot = setDay(snapshot, 'uris-pool', {
    intervals: [], status: null, reason: null, sourceRefs: [], evidenceRefs: [], restrictions: [],
  });
  for (const id of SPACE_IDS) {
    snapshot = setSpaceDay(snapshot, id, {
      intervals: [], status: null, reason: null, sourceRefs: [], evidenceRefs: [], restrictions: [],
    });
  }
  const errors = validateRecreationHoursSnapshot(snapshot).errors.join('\n');
  for (const id of ['uris-pool', ...SPACE_IDS]) {
    assert.match(errors, new RegExp(`${id} day 0 must inherit Dodge closure status`));
    assert.match(errors, new RegExp(`${id} day 0 must inherit Dodge closure reason`));
    assert.match(errors, new RegExp(`${id} day 0 must retain Dodge closure provenance`));
  }
});

test('requires a published child to inherit Dodge unresolved-parent semantics', () => {
  let snapshot = setDay(validSnapshot(), 'dodge', {
    intervals: [], status: 'Hours need verification', reason: 'Source conflict',
    sourceRefs: ['columbiaHours'], conflict: true,
  });
  snapshot = setDay(snapshot, 'uris-pool', { intervals: [], status: null, reason: null, sourceRefs: [], conflict: false });
  snapshot = setSpaceDay(snapshot, 'blue-gym', { intervals: [], status: null, reason: null, sourceRefs: [], conflict: false });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /must inherit Dodge unresolved/);
});

test('rejects intervals paired with an unavailable status', () => {
  const snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [['08:00', '20:00']], status: 'Closed',
  });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /Closed status cannot include intervals/);
});

test('rejects room intervals without target-specific evidence', () => {
  const snapshot = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [['10:00', '12:00']], sourceRefs: ['columbiaHours'],
    evidenceRefs: ['columbiaHours:dodge'],
  });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /target-specific evidence/);
});

test('returns validation errors for malformed child intervals without throwing', () => {
  const snapshot = setDay(validSnapshot(), 'uris-pool', { intervals: [null] });
  const result = validateRecreationHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /times must use HH:MM/);
});

test('returns validation errors for non-string evidence identities without throwing', () => {
  const snapshot = setDay(validSnapshot(), 'dodge', { evidenceRefs: [null] });

  const result = validateRecreationHoursSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /trusted target-specific evidence identity/);
});

test('rejects wrong-target sources, missing provenance, and reservation mismatches', () => {
  const wrongTarget = setSpaceDay(validSnapshot(), 'blue-gym', { sourceRefs: ['barnardFitness'] });
  assert.match(validateRecreationHoursSnapshot(wrongTarget).errors.join('\n'), /not allowed for blue-gym/);

  const missingProvenance = setDay(validSnapshot(), 'dodge', { sourceRefs: [] });
  assert.match(validateRecreationHoursSnapshot(missingProvenance).errors.join('\n'), /requires official provenance/);

  const reservationMismatch = setSpaceDay(validSnapshot(), 'blue-gym', {
    status: 'Reservation required', availabilityType: 'lap-swim',
  });
  assert.match(validateRecreationHoursSnapshot(reservationMismatch).errors.join('\n'), /Reservation required must use reservation-required/);

  const forgedIndependentReservation = setDay(validSnapshot(), 'uris-pool', {
    status: 'Reservation required', availabilityType: 'lap-swim',
  });
  assert.match(validateRecreationHoursSnapshot(forgedIndependentReservation).errors.join('\n'), /Reservation required must use reservation-required/);
});

test('enforces global conflict, status, and provenance invariants outside inherited child closures', () => {
  const conflictStatus = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [], conflict: true, status: 'Closed',
  });
  assert.match(validateRecreationHoursSnapshot(conflictStatus).errors.join('\n'), /conflict must use Hours need verification/);

  const unsourcedConflict = setDay(validSnapshot(), 'barnard-fitness', {
    conflict: true, status: 'Hours need verification', sourceRefs: [],
  });
  assert.match(validateRecreationHoursSnapshot(unsourcedConflict).errors.join('\n'), /requires official provenance/);

  const spaceOnlyStatus = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [], status: 'Separate hours not published', sourceRefs: ['barnardFitness'],
  });
  assert.match(validateRecreationHoursSnapshot(spaceOnlyStatus).errors.join('\n'), /Separate hours not published is only valid for Dodge spaces/);

  const openWithoutIntervals = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [], status: 'Open', sourceRefs: ['barnardFitness'],
  });
  assert.match(validateRecreationHoursSnapshot(openWithoutIntervals).errors.join('\n'), /Open status requires operating intervals/);
});

test('rejects prototype and extra facility and space IDs', () => {
  const facilities = validSnapshot();
  for (const id of ['__proto__', 'constructor', 'extra-facility']) {
    facilities.facilities.push({ id, parentId: null, days: [] });
  }
  const facilityErrors = validateRecreationHoursSnapshot(facilities).errors.join('\n');
  for (const id of ['__proto__', 'constructor', 'extra-facility']) {
    assert.match(facilityErrors, new RegExp(`unexpected facility: ${id}`));
  }

  const spaces = validSnapshot();
  const dodge = spaces.facilities.find(facility => facility.id === 'dodge');
  for (const id of ['__proto__', 'constructor', 'extra-space']) {
    dodge.spaces.push({ id, days: [] });
  }
  const spaceErrors = validateRecreationHoursSnapshot(spaces).errors.join('\n');
  for (const id of ['__proto__', 'constructor', 'extra-space']) {
    assert.match(spaceErrors, new RegExp(`unexpected Dodge space: ${id}`));
  }
});

test('rejects all unknown snapshot fields without stripping them into validity', () => {
  const snapshot = validSnapshot();
  snapshot.schemaVersion = 999;
  snapshot.sourceManifest = { bogus: 'https://example.com' };
  snapshot.unbounded = 'x'.repeat(100_000);
  snapshot.facilities[0].unknown = 'untrusted';
  snapshot.facilities[0].days[0].unknown = 'untrusted';
  snapshot.facilities[0].spaces[0].unknown = 'untrusted';
  const result = validateRecreationHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /snapshot contains unexpected field/);
  assert.match(result.errors.join('\n'), /contains unexpected field/);
  assert.equal(snapshot.unbounded.length, 100_000);
});

test('rejects malformed dates, intervals, text, and noncanonical source references without mutation', () => {
  const snapshot = validSnapshot();
  const original = structuredClone(snapshot);
  snapshot.facilities[0].days[1].date = snapshot.facilities[0].days[0].date;
  snapshot.facilities[0].days[0].intervals = [['10:00', '12:00'], ['11:00', '13:00']];
  snapshot.facilities[0].days[0].reason = '<script>';
  snapshot.facilities[0].days[0].sourceRefs = ['columbiaHours', 'columbiaHours'];
  const beforeValidation = structuredClone(snapshot);
  const result = validateRecreationHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /date must be/);
  assert.match(result.errors.join('\n'), /must not overlap/);
  assert.match(result.errors.join('\n'), /bounded plain text/);
  assert.match(result.errors.join('\n'), /canonical unique order/);
  assert.notDeepEqual(snapshot, original);
  assert.deepEqual(snapshot, beforeValidation);
});
