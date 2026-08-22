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

test('surfaces equal-priority unresolved conflicts instead of guessing', () => {
  const result = resolveWith([conflictingBlueGymA, conflictingBlueGymB]);

  assert.equal(spaceDay(result, 'blue-gym').status, 'Hours need verification');
  assert.equal(spaceDay(result, 'blue-gym').conflict, true);
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
