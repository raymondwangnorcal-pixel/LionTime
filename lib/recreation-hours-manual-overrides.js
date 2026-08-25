import { BARNARD_MANUAL_SOURCE_ID } from './recreation-hours-catalog.js';

export { BARNARD_MANUAL_SOURCE_ID };

const BARNARD_ACCESS_RESTRICTIONS = Object.freeze([
  'Barnard students, faculty, and staff',
]);

export const RECREATION_MANUAL_OVERRIDES = Object.freeze([
  barnardFitnessOverride('2026-08-24', '2026-08-24', [], 'Closed'),
  barnardFitnessOverride('2026-08-25', '2026-08-25', [['09:00', '14:00']]),
  barnardFitnessOverride('2026-08-26', '2026-08-27', [['09:00', '19:00']]),
  barnardFitnessOverride('2026-08-28', '2026-09-07', [], 'Closed'),
]);

export function matchesApprovedBarnardManualDay(day, targetId) {
  const expected = RECREATION_MANUAL_OVERRIDES.find(item => (
    item.effectiveStart <= day?.date && day?.date <= item.effectiveEnd
  ));
  return targetId === 'barnard-fitness'
    && Boolean(expected)
    && JSON.stringify(day.intervals) === JSON.stringify(expected.dateIntervals)
    && day.status === (expected.status || null)
    && day.reason === null
    && day.availabilityType === 'facility-hours'
    && JSON.stringify(day.accessRestrictions) === JSON.stringify(BARNARD_ACCESS_RESTRICTIONS)
    && Array.isArray(day.restrictions)
    && day.restrictions.length === 0
    && day.conflict === false;
}

function barnardFitnessOverride(effectiveStart, effectiveEnd, dateIntervals, status = null) {
  return Object.freeze({
    targetId: 'barnard-fitness',
    sourceId: BARNARD_MANUAL_SOURCE_ID,
    evidenceRef: `${BARNARD_MANUAL_SOURCE_ID}:barnard-fitness`,
    priority: 0,
    effectiveStart,
    effectiveEnd,
    weeklyIntervals: null,
    dateIntervals: Object.freeze(dateIntervals.map(interval => Object.freeze([...interval]))),
    status,
    reason: null,
    availabilityType: 'facility-hours',
    accessRestrictions: BARNARD_ACCESS_RESTRICTIONS,
    sourceUpdatedAt: null,
    unavailableStatus: null,
  });
}
