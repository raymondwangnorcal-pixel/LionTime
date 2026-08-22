import assert from 'node:assert/strict';

import { resolveRecreationSnapshot } from '../../lib/recreation-hours-resolver.js';

export const generated = new Date('2026-08-21T16:00:00-04:00');

export const evidence = (overrides = {}) => {
  const targetId = overrides.targetId || 'dodge';
  const sourceId = overrides.sourceId || 'fall-dodge';
  return {
    targetId,
    sourceId,
    evidenceRef: `${sourceId}:${targetId}`,
    priority: 3,
    effectiveStart: '2026-08-17',
    effectiveEnd: '2026-12-23',
    weeklyIntervals: {
      0: [],
      1: [['06:00', '23:00']],
      2: [['06:00', '23:00']],
      3: [['06:00', '23:00']],
      4: [['06:00', '23:00']],
      5: [['06:00', '23:00']],
      6: [],
    },
    dateIntervals: null,
    status: null,
    reason: null,
    availabilityType: 'facility-hours',
    accessRestrictions: [],
    sourceUpdatedAt: null,
    unavailableStatus: null,
    ...overrides,
  };
};

export const openDodge = evidence();
export const fallDodge = openDodge;
export const springDodge = evidence({
  sourceId: 'spring-dodge',
  effectiveStart: '2026-01-20',
  effectiveEnd: '2026-05-15',
  weeklyIntervals: { 1: [['07:00', '22:00']] },
});
export const openPool = evidence({
  targetId: 'uris-pool',
  sourceId: 'pool-lap-swim',
  priority: 2,
  weeklyIntervals: { 5: [['12:00', '14:00']] },
  availabilityType: 'lap-swim',
});
export const dodgeMaintenance = evidence({
  sourceId: 'dodge-maintenance',
  priority: 1,
  effectiveStart: '2026-08-21',
  effectiveEnd: '2026-08-21',
  weeklyIntervals: null,
  dateIntervals: [],
  status: 'Closed for maintenance',
  reason: 'Floor maintenance',
});
export const poolMaintenance = evidence({
  targetId: 'uris-pool',
  sourceId: 'pool-maintenance',
  priority: 1,
  effectiveStart: '2026-08-21',
  effectiveEnd: '2026-08-21',
  weeklyIntervals: null,
  dateIntervals: [],
  status: 'Closed for maintenance',
  reason: 'Pool maintenance',
});
export const modifiedDodgeClose = evidence({
  sourceId: 'modified-dodge-close',
  priority: 1,
  effectiveStart: '2026-08-21',
  effectiveEnd: '2026-08-21',
  weeklyIntervals: null,
  dateIntervals: [['06:00', '18:00']],
});
export const conflictingBlueGymA = evidence({
  targetId: 'blue-gym',
  sourceId: 'blue-a',
  priority: 2,
  weeklyIntervals: { 5: [['10:00', '12:00']] },
  availabilityType: 'open-recreation',
});
export const conflictingBlueGymB = evidence({
  targetId: 'blue-gym',
  sourceId: 'blue-b',
  priority: 2,
  weeklyIntervals: { 5: [['14:00', '16:00']] },
  availabilityType: 'open-recreation',
});

export function resolveWith(items, options = {}) {
  return resolveRecreationSnapshot({ evidence: items, generated: options.generated || generated });
}

export function day(snapshot, facilityId, date = '2026-08-21') {
  const facility = snapshot.facilities.find(candidate => candidate.id === facilityId);
  assert.ok(facility, `missing facility ${facilityId}`);
  const result = facility.days.find(candidate => candidate.date === date);
  assert.ok(result, `missing ${facilityId} day ${date}`);
  return result;
}

export function spaceDay(snapshot, spaceId, date = '2026-08-21') {
  const dodge = snapshot.facilities.find(candidate => candidate.id === 'dodge');
  assert.ok(dodge, 'missing Dodge facility');
  const space = dodge.spaces.find(candidate => candidate.id === spaceId);
  assert.ok(space, `missing Dodge space ${spaceId}`);
  const result = space.days.find(candidate => candidate.date === date);
  assert.ok(result, `missing ${spaceId} day ${date}`);
  return result;
}

export function validSnapshot() {
  const snapshot = resolveWith([
    openDodge,
    evidence({ targetId: 'uris-pool', sourceId: 'pool-baseline', priority: 3, availabilityType: 'lap-swim' }),
    evidence({ targetId: 'barnard-fitness', sourceId: 'barnard-baseline', priority: 3 }),
    ...[
      'blue-gym',
      'levien-gymnasium',
      'functional-fitness-studio',
      'aerobics-room-4',
      'squash-courts',
    ].map(targetId => evidence({
      targetId,
      sourceId: `${targetId}-baseline`,
      priority: 3,
      availabilityType: 'open-recreation',
    })),
  ]);
  const officialSourceFor = id => id === 'barnard-fitness' ? 'barnardFitness' : 'columbiaHours';
  const officializeDay = resolvedDay => {
    resolvedDay.evidenceRefs = [...new Set(resolvedDay.evidenceRefs.map(ref => {
      const targetId = ref.slice(ref.indexOf(':') + 1);
      return `${officialSourceFor(targetId)}:${targetId}`;
    }))].sort();
    resolvedDay.sourceRefs = [...new Set(resolvedDay.evidenceRefs.map(ref => ref.slice(0, ref.indexOf(':'))))].sort();
    for (const restriction of resolvedDay.restrictions) {
      restriction.evidenceRefs = [...new Set(restriction.evidenceRefs.map(ref => {
        const targetId = ref.slice(ref.indexOf(':') + 1);
        return `${officialSourceFor(targetId)}:${targetId}`;
      }))].sort();
      restriction.sourceRefs = [...new Set(restriction.evidenceRefs.map(ref => ref.slice(0, ref.indexOf(':'))))].sort();
    }
  };
  for (const facility of snapshot.facilities) {
    for (const resolvedDay of facility.days) officializeDay(resolvedDay);
    for (const space of facility.spaces || []) {
      for (const resolvedDay of space.days) officializeDay(resolvedDay);
    }
  }
  return snapshot;
}

export function withoutFacility(id) {
  const snapshot = structuredClone(validSnapshot());
  snapshot.facilities = snapshot.facilities.filter(facility => facility.id !== id);
  return snapshot;
}

export function withoutSpace(id) {
  const snapshot = structuredClone(validSnapshot());
  const dodge = snapshot.facilities.find(facility => facility.id === 'dodge');
  dodge.spaces = dodge.spaces.filter(space => space.id !== id);
  return snapshot;
}

export function withSource(url) {
  const snapshot = structuredClone(validSnapshot());
  snapshot.facilities[0].days[0].sourceRefs = [url];
  return snapshot;
}

export function setDay(snapshot, id, changes) {
  const copy = structuredClone(snapshot);
  const facility = copy.facilities.find(candidate => candidate.id === id);
  assert.ok(facility, `missing facility ${id}`);
  Object.assign(facility.days[0], changes);
  return copy;
}

export function setSpaceDay(snapshot, id, changes) {
  const copy = structuredClone(snapshot);
  const dodge = copy.facilities.find(candidate => candidate.id === 'dodge');
  const space = dodge?.spaces.find(candidate => candidate.id === id);
  assert.ok(space, `missing Dodge space ${id}`);
  Object.assign(space.days[0], changes);
  return copy;
}

export function nextSnapshot() {
  const snapshot = structuredClone(validSnapshot());
  snapshot.generated = '2026-08-22T16:00:00.000Z';
  for (const facility of snapshot.facilities) {
    for (const resolvedDay of facility.days) {
      const next = new Date(`${resolvedDay.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      resolvedDay.date = next.toISOString().slice(0, 10);
    }
    for (const space of facility.spaces || []) {
      for (const resolvedDay of space.days) {
        const next = new Date(`${resolvedDay.date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        resolvedDay.date = next.toISOString().slice(0, 10);
      }
    }
  }
  return snapshot;
}
