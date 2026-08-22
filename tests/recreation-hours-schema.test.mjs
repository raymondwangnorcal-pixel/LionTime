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

function resolverSnapshotWithOfficialSources(items = []) {
  return resolveRecreationSnapshot({
    generated,
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
    sourceRefs: ['columbiaHours', 'columbiaModifications'], conflict: true,
  });
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
  });
  snapshot = setDay(snapshot, 'uris-pool', { intervals: [], status: null, reason: null, sourceRefs: [] });
  for (const id of SPACE_IDS) {
    snapshot = setSpaceDay(snapshot, id, { intervals: [], status: null, reason: null, sourceRefs: [] });
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

test('rejects room intervals without room-specific provenance', () => {
  const snapshot = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [['10:00', '12:00']], sourceRefs: ['dodge-baseline'],
  });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /room-specific provenance/);
});

test('returns validation errors for malformed child intervals without throwing', () => {
  const snapshot = setDay(validSnapshot(), 'uris-pool', { intervals: [null] });
  const result = validateRecreationHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /times must use HH:MM/);
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
