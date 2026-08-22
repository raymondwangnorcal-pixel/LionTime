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

  assert.deepEqual(day(result, 'dodge').intervals, [['06:00', '12:00'], ['14:00', '18:00']]);
  assert.deepEqual(day(result, 'dodge').sourceRefs, ['dodge-replacement', 'dodge-timed-maintenance', 'fall-dodge']);
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
