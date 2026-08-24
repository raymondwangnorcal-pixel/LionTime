import assert from 'node:assert/strict';
import test from 'node:test';

import {
  conflictingBlueGymA,
  conflictingBlueGymB,
  day,
  dodgeMaintenance,
  evidence,
  fallDodge,
  modifiedDodgeClose,
  openDodge,
  openPool,
  poolMaintenance,
  resolveWith,
  spaceDay,
  springDodge,
} from './helpers/recreation-hours-fixture.mjs';
import { resolveRecreationSnapshot } from '../lib/recreation-hours-resolver.js';

test('selects only the baseline schedule covering the target date', () => {
  const snapshot = resolveRecreationSnapshot({
    generated: new Date('2026-08-21T16:00:00-04:00'),
    evidence: [springDodge, fallDodge],
  });

  assert.deepEqual(day(snapshot, 'dodge', '2026-08-21').intervals, [['06:00', '23:00']]);
  assert.deepEqual(day(snapshot, 'dodge', '2026-08-22').sourceRefs, ['fall-dodge']);
});

test('applies a specific modified close before the baseline', () => {
  const result = resolveWith([fallDodge, modifiedDodgeClose]);

  assert.deepEqual(day(result, 'dodge', '2026-08-21').intervals, [['06:00', '18:00']]);
});

test('composes replacement hours with a compatible timed restriction', () => {
  const result = resolveWith([
    openDodge,
    evidence({
      sourceId: 'dodge-replacement',
      priority: 1,
      effectiveStart: '2026-08-21',
      effectiveEnd: '2026-08-21',
      weeklyIntervals: null,
      dateIntervals: [['06:00', '18:00']],
    }),
    evidence({
      sourceId: 'dodge-timed-maintenance',
      priority: 1,
      effectiveStart: '2026-08-21',
      effectiveEnd: '2026-08-21',
      weeklyIntervals: null,
      dateIntervals: [['12:00', '14:00']],
      status: 'Closed for maintenance',
      reason: 'Court repair',
    }),
  ]);

  const resolved = day(result, 'dodge');
  assert.deepEqual(resolved.intervals, [['06:00', '12:00'], ['14:00', '18:00']]);
  assert.equal(resolved.status, null);
  assert.equal(resolved.reason, null);
  assert.equal(resolved.availabilityType, 'facility-hours');
  assert.deepEqual(resolved.restrictions, [{
    targetId: 'dodge',
    intervals: [['12:00', '14:00']],
    status: 'Closed for maintenance',
    reason: 'Court repair',
    availabilityType: 'facility-hours',
    accessRestrictions: [],
    sourceRefs: ['dodge-timed-maintenance'],
    evidenceRefs: ['dodge-timed-maintenance:dodge'],
  }]);
  assert.deepEqual(resolved.sourceRefs, ['dodge-replacement', 'dodge-timed-maintenance', 'fall-dodge']);
  assert.deepEqual(resolved.evidenceRefs, [
    'dodge-replacement:dodge',
    'dodge-timed-maintenance:dodge',
    'fall-dodge:dodge',
  ]);
});

test('clips an inherited Dodge restriction to a child-specific availability window', () => {
  const result = resolveWith([
    openDodge,
    evidence({
      sourceId: 'dodge-timed-maintenance', priority: 1,
      effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21',
      weeklyIntervals: null, dateIntervals: [['12:00', '14:00']],
      status: 'Closed for maintenance', reason: 'Floor maintenance',
    }),
    evidence({
      targetId: 'blue-gym', sourceId: 'blue-specific',
      weeklyIntervals: { 5: [['13:00', '16:00']] }, availabilityType: 'open-recreation',
    }),
  ]);

  const blue = spaceDay(result, 'blue-gym');
  assert.deepEqual(blue.intervals, [['14:00', '16:00']]);
  assert.deepEqual(blue.restrictions, [{
    targetId: 'dodge',
    intervals: [['13:00', '14:00']],
    status: 'Closed for maintenance',
    reason: 'Floor maintenance',
    availabilityType: 'facility-hours',
    accessRestrictions: [],
    sourceRefs: ['dodge-timed-maintenance'],
    evidenceRefs: ['dodge-timed-maintenance:dodge'],
  }]);
  assert.ok(blue.evidenceRefs.includes('blue-specific:blue-gym'));
  assert.ok(blue.evidenceRefs.includes('dodge-timed-maintenance:dodge'));
});

test('inherits a known Dodge restriction without inventing an unavailable child schedule', () => {
  const result = resolveWith([
    evidence({
      effectiveStart: null, effectiveEnd: null,
      weeklyIntervals: null, dateIntervals: null,
      unavailableStatus: 'Hours need verification',
    }),
    evidence({
      targetId: 'blue-gym', sourceId: 'blue-unavailable',
      effectiveStart: null, effectiveEnd: null,
      weeklyIntervals: null, dateIntervals: null,
      unavailableStatus: 'Separate hours not published',
      availabilityType: null,
    }),
    evidence({
      sourceId: 'dodge-timed-maintenance', priority: 1,
      effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21',
      weeklyIntervals: null, dateIntervals: [['00:00', '06:00']],
      status: 'Closed for maintenance', reason: 'Annual maintenance',
    }),
  ]);

  const blue = spaceDay(result, 'blue-gym');
  assert.deepEqual(blue.intervals, []);
  assert.equal(blue.status, 'Separate hours not published');
  assert.deepEqual(blue.restrictions, [{
    targetId: 'dodge', intervals: [['00:00', '06:00']], status: 'Closed for maintenance',
    reason: 'Annual maintenance', availabilityType: 'facility-hours', accessRestrictions: [],
    sourceRefs: ['dodge-timed-maintenance'], evidenceRefs: ['dodge-timed-maintenance:dodge'],
  }]);
});

test('resolves explicit unavailable evidence without assigning seasonal intervals', () => {
  const result = resolveWith([evidence({
    targetId: 'barnard-fitness', sourceId: 'barnardFitness',
    evidenceRef: 'barnardFitness:barnard-fitness',
    effectiveStart: null, effectiveEnd: null,
    weeklyIntervals: null, dateIntervals: null,
    unavailableStatus: 'Hours need verification',
    accessRestrictions: ['Barnard students, faculty, and staff'],
  })]);

  const barnard = day(result, 'barnard-fitness');
  assert.deepEqual(barnard.intervals, []);
  assert.equal(barnard.status, 'Hours need verification');
  assert.deepEqual(barnard.accessRestrictions, ['Barnard students, faculty, and staff']);
  assert.deepEqual(barnard.sourceRefs, ['barnardFitness']);
  assert.deepEqual(barnard.evidenceRefs, ['barnardFitness:barnard-fitness']);
  assert.deepEqual(barnard.restrictions, []);
});

test('lets a higher-priority ambiguous recurring closure suppress a normal baseline', () => {
  const result = resolveWith([
    openDodge,
    evidence({
      sourceId: 'ambiguous-recurring-closure',
      priority: 1,
      effectiveStart: null,
      effectiveEnd: null,
      weeklyIntervals: null,
      dateIntervals: null,
      unavailableStatus: 'Hours need verification',
      availabilityType: 'facility-hours',
    }),
  ]);

  const dodge = day(result, 'dodge');
  assert.deepEqual(dodge.intervals, []);
  assert.equal(dodge.status, 'Hours need verification');
  assert.deepEqual(dodge.sourceRefs, ['ambiguous-recurring-closure']);
});

test('uses a Blue Gym-derived Dodge fallback only when stronger Dodge evidence is unavailable', () => {
  const unavailable = evidence({
    sourceId: 'columbiaHours',
    evidenceRef: 'columbiaHours:dodge',
    priority: 5,
    effectiveStart: null,
    effectiveEnd: null,
    weeklyIntervals: null,
    dateIntervals: null,
    unavailableStatus: 'Hours need verification',
  });
  const calendarFallback = evidence({
    sourceId: 'columbiaHours',
    evidenceRef: 'columbiaHours:dodge',
    priority: 4,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [['06:00', '22:00']],
  });

  assert.deepEqual(day(resolveWith([unavailable, calendarFallback]), 'dodge').intervals, [['06:00', '22:00']]);
  assert.deepEqual(day(resolveWith([unavailable, calendarFallback, openDodge]), 'dodge').intervals, [['06:00', '23:00']]);
  assert.equal(day(resolveWith([unavailable, calendarFallback, dodgeMaintenance]), 'dodge').status, 'Closed for maintenance');
});

test('surfaces equal-priority unresolved conflicts instead of guessing', () => {
  const result = resolveWith([conflictingBlueGymA, conflictingBlueGymB]);

  assert.equal(spaceDay(result, 'blue-gym').status, 'Hours need verification');
  assert.equal(spaceDay(result, 'blue-gym').conflict, true);
});

test('canonicalizes conflict source references regardless of evidence arrival order', () => {
  const forward = resolveWith([openDodge, conflictingBlueGymA, conflictingBlueGymB]);
  const reverse = resolveWith([openDodge, conflictingBlueGymB, conflictingBlueGymA]);

  assert.deepEqual(spaceDay(forward, 'blue-gym').sourceRefs, ['blue-a', 'blue-b']);
  assert.deepEqual(spaceDay(reverse, 'blue-gym').sourceRefs, ['blue-a', 'blue-b']);
});

test('uses a stable source-ID tie break for identical equal-priority evidence', () => {
  const first = evidence({ targetId: 'blue-gym', sourceId: 'blue-a', priority: 2, weeklyIntervals: { 5: [['10:00', '12:00']] } });
  const second = evidence({ targetId: 'blue-gym', sourceId: 'blue-b', priority: 2, weeklyIntervals: { 5: [['10:00', '12:00']] } });

  const forward = resolveWith([openDodge, first, second]);
  const reverse = resolveWith([openDodge, second, first]);

  assert.deepEqual(spaceDay(forward, 'blue-gym').sourceRefs, ['blue-a']);
  assert.deepEqual(spaceDay(reverse, 'blue-gym').sourceRefs, ['blue-a']);
});

test('prefers the narrower equal-priority time-specific modification', () => {
  const result = resolveWith([
    openDodge,
    evidence({
      targetId: 'blue-gym',
      sourceId: 'blue-all-day',
      priority: 1,
      effectiveStart: '2026-08-21',
      effectiveEnd: '2026-08-21',
      weeklyIntervals: null,
      dateIntervals: [['06:00', '18:00']],
      availabilityType: 'open-recreation',
    }),
    evidence({
      targetId: 'blue-gym',
      sourceId: 'blue-two-hour',
      priority: 1,
      effectiveStart: '2026-08-21',
      effectiveEnd: '2026-08-21',
      weeklyIntervals: null,
      dateIntervals: [['08:00', '10:00']],
      availabilityType: 'open-recreation',
    }),
  ]);

  assert.deepEqual(spaceDay(result, 'blue-gym').intervals, [['08:00', '10:00']]);
  assert.deepEqual(spaceDay(result, 'blue-gym').sourceRefs, ['blue-two-hour']);
});

test('does not use a seasonal baseline with missing or invalid coverage', () => {
  const result = resolveWith([
    evidence({ sourceId: 'missing-end', effectiveEnd: null }),
    evidence({ sourceId: 'reversed-range', effectiveStart: '2026-12-23', effectiveEnd: '2026-08-17' }),
  ]);

  assert.deepEqual(day(result, 'dodge').intervals, []);
  assert.equal(day(result, 'dodge').status, 'Hours need verification');
  assert.deepEqual(day(result, 'dodge').sourceRefs, []);
});

test('generates fourteen consecutive Eastern dates', () => {
  const result = resolveWith([openDodge]);
  const dates = result.facilities.find(item => item.id === 'dodge').days.map(item => item.date);

  assert.equal(dates.length, 14);
  assert.deepEqual(dates.slice(0, 3), ['2026-08-21', '2026-08-22', '2026-08-23']);
  assert.equal(dates.at(-1), '2026-09-03');
});

test('Dodge maintenance closes Dodge, Uris Pool, and every nested Dodge space', () => {
  const result = resolveWith([
    openDodge,
    openPool,
    evidence({ targetId: 'blue-gym', sourceId: 'blue-open', availabilityType: 'open-recreation' }),
    dodgeMaintenance,
  ]);

  assert.equal(day(result, 'dodge').status, 'Closed for maintenance');
  assert.equal(day(result, 'uris-pool').status, 'Closed for maintenance');
  assert.deepEqual(day(result, 'uris-pool').intervals, []);
  assert.equal(spaceDay(result, 'blue-gym').status, 'Closed for maintenance');
  assert.deepEqual(spaceDay(result, 'blue-gym').intervals, []);
  assert.equal(spaceDay(result, 'functional-fitness-studio').status, 'Closed for maintenance');
});

test('clips Uris Pool and nested-space hours at a Dodge early close', () => {
  const result = resolveWith([
    openDodge,
    modifiedDodgeClose,
    evidence({ targetId: 'uris-pool', sourceId: 'pool-evening', weeklyIntervals: { 5: [['17:00', '20:00']] }, availabilityType: 'lap-swim' }),
    evidence({ targetId: 'blue-gym', sourceId: 'blue-evening', weeklyIntervals: { 5: [['17:00', '20:00']] }, availabilityType: 'open-recreation' }),
  ]);

  assert.deepEqual(day(result, 'uris-pool').intervals, [['17:00', '18:00']]);
  assert.deepEqual(spaceDay(result, 'blue-gym').intervals, [['17:00', '18:00']]);
});

test('clips child hours around timed Dodge maintenance without closing the whole day', () => {
  const result = resolveWith([
    openDodge,
    evidence({
      sourceId: 'dodge-timed-maintenance',
      priority: 1,
      effectiveStart: '2026-08-21',
      effectiveEnd: '2026-08-21',
      weeklyIntervals: null,
      dateIntervals: [['12:00', '14:00']],
      status: 'Closed for maintenance',
      reason: 'Floor maintenance',
    }),
    evidence({ targetId: 'uris-pool', sourceId: 'pool-daytime', weeklyIntervals: { 5: [['10:00', '16:00']] }, availabilityType: 'lap-swim' }),
    evidence({ targetId: 'blue-gym', sourceId: 'blue-daytime', weeklyIntervals: { 5: [['10:00', '16:00']] }, availabilityType: 'open-recreation' }),
  ]);

  assert.deepEqual(day(result, 'uris-pool').intervals, [['10:00', '12:00'], ['14:00', '16:00']]);
  assert.deepEqual(spaceDay(result, 'blue-gym').intervals, [['10:00', '12:00'], ['14:00', '16:00']]);
  assert.equal(day(result, 'uris-pool').status, null);
  assert.equal(spaceDay(result, 'blue-gym').status, null);
});

test('pool-only maintenance does not close Dodge', () => {
  const result = resolveWith([openDodge, openPool, poolMaintenance]);

  assert.equal(day(result, 'dodge').status, null);
  assert.equal(day(result, 'uris-pool').status, 'Closed for maintenance');
});

test('preserves pool and room-specific availability when Dodge is open', () => {
  const result = resolveWith([
    openDodge,
    openPool,
    evidence({ targetId: 'blue-gym', sourceId: 'blue-open', availabilityType: 'open-recreation' }),
  ]);

  assert.deepEqual(day(result, 'uris-pool').intervals, [['12:00', '14:00']]);
  assert.deepEqual(spaceDay(result, 'blue-gym').intervals, [['06:00', '23:00']]);
  assert.equal(spaceDay(result, 'blue-gym').availabilityType, 'open-recreation');
});

test('missing room schedule never inherits Dodge intervals', () => {
  const result = resolveWith([openDodge, openPool]);

  assert.deepEqual(spaceDay(result, 'functional-fitness-studio').intervals, []);
  assert.equal(spaceDay(result, 'functional-fitness-studio').status, 'Separate hours not published');
});

test('preserves a missing room state when Dodge has no verifiable schedule', () => {
  const result = resolveWith([]);

  assert.deepEqual(spaceDay(result, 'functional-fitness-studio').intervals, []);
  assert.equal(spaceDay(result, 'functional-fitness-studio').status, 'Separate hours not published');
});

test('retains baseline access restrictions and provenance through replacement hours', () => {
  const baseline = evidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnard-baseline',
    accessRestrictions: ['Barnard ID required'],
  });
  const replacement = evidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnard-replacement',
    priority: 1,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [['10:00', '16:00']],
  });
  const result = resolveWith([baseline, replacement]);

  assert.deepEqual(day(result, 'barnard-fitness').accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(day(result, 'barnard-fitness').sourceRefs, ['barnard-baseline', 'barnard-replacement']);
});

test('retains baseline access restrictions through a whole-day closure', () => {
  const baseline = evidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnard-baseline',
    accessRestrictions: ['Barnard ID required'],
  });
  const closure = evidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnard-closure',
    priority: 1,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [],
    status: 'Closed for maintenance',
  });
  const result = resolveWith([baseline, closure]);

  assert.deepEqual(day(result, 'barnard-fitness').accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(day(result, 'barnard-fitness').sourceRefs, ['barnard-baseline', 'barnard-closure']);
});
