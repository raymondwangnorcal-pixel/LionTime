import { DODGE_SPACES, RECREATION_FACILITIES } from './recreation-hours-catalog.js';

const EASTERN_TIME_ZONE = 'America/New_York';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FACILITY_IDS = Object.keys(RECREATION_FACILITIES);
const SPACE_IDS = Object.keys(DODGE_SPACES);

/**
 * Resolves bounded official schedule evidence into fourteen Eastern daily states.
 * Evidence outside a valid declared effective period is never used as a baseline.
 */
export function resolveRecreationSnapshot({ evidence = [], generated } = {}) {
  const timestamp = validGeneratedDate(generated);
  const dates = easternDates(timestamp, 14);
  const usableEvidence = Array.isArray(evidence) ? evidence.filter(isKnownEvidence) : [];

  const facilities = FACILITY_IDS.map(id => resolveFacility(id, dates, usableEvidence));
  const dodge = facilities.find(facility => facility.id === 'dodge');
  const pool = facilities.find(facility => facility.id === 'uris-pool');
  pool.days = pool.days.map((poolDay, index) => constrainChild(dodge.days[index], poolDay));
  dodge.spaces = SPACE_IDS.map(id => resolveSpace(id, dates, usableEvidence));
  dodge.spaces = dodge.spaces.map(space => ({
    ...space,
    days: space.days.map((spaceDay, index) => constrainChild(dodge.days[index], spaceDay)),
  }));

  return {
    generated: timestamp.toISOString(),
    facilities,
  };
}

function resolveFacility(id, dates, evidence) {
  const definition = RECREATION_FACILITIES[id];
  return {
    id,
    name: definition.name,
    kind: definition.kind,
    parentId: definition.parentId || null,
    days: dates.map(date => resolveDay({ id, date, evidence, missingStatus: 'Hours need verification' })),
    spaces: id === 'dodge' ? [] : undefined,
  };
}

function resolveSpace(id, dates, evidence) {
  return {
    id,
    name: DODGE_SPACES[id].name,
    days: dates.map(date => resolveDay({ id, date, evidence, missingStatus: 'Separate hours not published' })),
  };
}

function resolveDay({ id, date, evidence, missingStatus }) {
  const applicable = evidence.filter(item => item.targetId === id && coversDate(item, date));
  const baselines = selectEvidence(applicable.filter(item => item.weeklyIntervals !== null), item => ({
    intervals: intervalsForWeekday(item.weeklyIntervals, weekdayFor(date)),
    status: item.status,
    reason: item.reason,
    availabilityType: item.availabilityType,
    accessRestrictions: item.accessRestrictions,
  }));
  const primaryModifications = selectEvidence(applicable.filter(isPrimaryModification), item => ({
    intervals: cloneIntervals(item.dateIntervals),
    status: item.status,
    reason: item.reason,
    availabilityType: item.availabilityType,
    accessRestrictions: item.accessRestrictions,
  }));
  const timedRestrictions = selectTimedRestrictions(applicable.filter(isTimedRestriction));

  if (primaryModifications.conflict || timedRestrictions.conflict || (!primaryModifications.evidence && baselines.conflict)) {
    return conflictDay(date, [...baselines.candidates, ...primaryModifications.candidates, ...timedRestrictions.candidates]);
  }

  const primary = primaryModifications.evidence;
  const baseline = baselines.evidence;
  const sources = [baseline, primary, ...timedRestrictions.evidence].filter(Boolean);
  if (primary?.dateIntervals.length === 0) {
    return resolvedDay(date, primary, [], primary.status || 'Closed', sources);
  }

  const base = primary || baseline;
  if (base) {
    const intervals = primary
      ? cloneIntervals(primary.dateIntervals)
      : intervalsForWeekday(baseline.weeklyIntervals, weekdayFor(date));
    if (!timedRestrictions.evidence.length) return resolvedDay(date, base, intervals, base.status, sources);

    const restriction = timedRestrictions.evidence[0];
    return resolvedDay(
      date,
      restriction,
      timedRestrictions.evidence.reduce((remaining, item) => subtractIntervals(remaining, item.dateIntervals), intervals),
      restriction.status,
      sources,
    );
  }

  if (timedRestrictions.evidence.length) return conflictDay(date, timedRestrictions.evidence);

  return {
    date,
    intervals: [],
    status: missingStatus,
    reason: null,
    availabilityType: null,
    accessRestrictions: [],
    sourceRefs: [],
    conflict: false,
  };
}

function isPrimaryModification(item) {
  return item.dateIntervals !== null && (item.dateIntervals.length === 0 || item.status === null);
}

function isTimedRestriction(item) {
  return item.dateIntervals !== null && item.dateIntervals.length > 0 && item.status !== null;
}

function selectEvidence(items, payloadFor) {
  if (!items.length) return { evidence: null, candidates: [], conflict: false };
  const priority = Math.min(...items.map(item => item.priority));
  let candidates = items.filter(item => item.priority === priority);
  const specificity = Math.max(...candidates.map(specificityFor));
  candidates = candidates.filter(item => specificityFor(item) === specificity);

  const newest = newestTimestamp(candidates);
  if (newest !== null) candidates = candidates.filter(item => timestampFor(item) === newest);

  const conflict = candidates.length > 1 && !candidates.every(item => samePayload(payloadFor(item), payloadFor(candidates[0])));
  const ordered = bySourceId(candidates);
  return { evidence: conflict ? null : ordered[0], candidates: ordered, conflict };
}

function selectTimedRestrictions(items) {
  if (!items.length) return { evidence: [], candidates: [], conflict: false };
  const priority = Math.min(...items.map(item => item.priority));
  const candidates = items.filter(item => item.priority === priority);
  const selected = [];

  for (const alternatives of groupBy(candidates, item => JSON.stringify(item.dateIntervals)).values()) {
    const newest = newestTimestamp(alternatives);
    const current = newest === null ? alternatives : alternatives.filter(item => timestampFor(item) === newest);
    const ordered = bySourceId(current);
    const compatibleAlternatives = ordered.every(item => sameTimedRestriction(item, ordered[0]));
    if (!compatibleAlternatives) return { evidence: [], candidates: bySourceId(candidates), conflict: true };
    selected.push(ordered[0]);
  }

  const ordered = bySourceId(selected);
  const compatible = ordered.every(item => sameTimedRestriction(item, ordered[0]));
  return { evidence: compatible ? ordered : [], candidates: bySourceId(candidates), conflict: !compatible };
}

function sameTimedRestriction(left, right) {
  return left.status === right.status
    && left.reason === right.reason
    && left.availabilityType === right.availabilityType
    && samePayload(left.accessRestrictions, right.accessRestrictions);
}

function groupBy(items, keyFor) {
  return items.reduce((groups, item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) || []), item]);
    return groups;
  }, new Map());
}

function specificityFor(item) {
  if (item.dateIntervals !== null) return 1_000_000 + intervalSpecificity(item.dateIntervals);
  if (hasBoundedRange(item)) return 10_000 - rangeLength(item.effectiveStart, item.effectiveEnd);
  return 0;
}

function intervalSpecificity(intervals) {
  if (!intervals.length) return 0;
  return 10_000 - Math.min(...intervals.map(([start, end]) => minutes(end) - minutes(start)));
}

function newestTimestamp(items) {
  const timestamps = items.map(timestampFor).filter(value => value !== null);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function timestampFor(item) {
  const timestamp = Date.parse(item.sourceUpdatedAt || '');
  return Number.isNaN(timestamp) ? null : timestamp;
}

function samePayload(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolvedDay(date, source, intervals, status = source.status, sources = [source]) {
  return {
    date,
    intervals: cloneIntervals(intervals),
    status: status || null,
    reason: source.reason || null,
    availabilityType: source.availabilityType || null,
    accessRestrictions: unique(sources.flatMap(item => item.accessRestrictions || [])),
    sourceRefs: unique(sources.map(item => item.sourceId)),
    conflict: false,
  };
}

function conflictDay(date, candidates) {
  return {
    date,
    intervals: [],
    status: 'Hours need verification',
    reason: null,
    availabilityType: null,
    accessRestrictions: unique(candidates.flatMap(item => item.accessRestrictions || [])),
    sourceRefs: unique(candidates.map(item => item.sourceId)),
    conflict: true,
  };
}

function constrainChild(dodgeDay, childDay) {
  if (isVerifiedAllDayClosure(dodgeDay)) return constrainedDay(dodgeDay, childDay, dodgeDay.status || 'Closed');
  if (isUnresolved(dodgeDay)) return constrainUnresolvedChild(dodgeDay, childDay);
  const intervals = intersectIntervals(childDay.intervals, dodgeDay.intervals);
  return {
    ...childDay,
    intervals,
    sourceRefs: samePayload(intervals, childDay.intervals)
      ? childDay.sourceRefs
      : unique([...childDay.sourceRefs, ...dodgeDay.sourceRefs]),
  };
}

function isVerifiedAllDayClosure(day) {
  return day.intervals.length === 0
    && !day.conflict
    && day.status !== 'Hours need verification'
    && day.sourceRefs.length > 0;
}

function isUnresolved(day) {
  return day.conflict || day.status === 'Hours need verification';
}

function constrainUnresolvedChild(dodgeDay, childDay) {
  if (childDay.status === 'Separate hours not published' && childDay.sourceRefs.length === 0) return childDay;
  return {
    ...childDay,
    intervals: [],
    status: 'Hours need verification',
    reason: dodgeDay.reason,
    sourceRefs: unique([...childDay.sourceRefs, ...dodgeDay.sourceRefs]),
    conflict: true,
  };
}

function constrainedDay(dodgeDay, childDay, status) {
  return {
    ...childDay,
    intervals: [],
    status,
    reason: dodgeDay.reason,
    sourceRefs: unique([...childDay.sourceRefs, ...dodgeDay.sourceRefs]),
    conflict: childDay.conflict || dodgeDay.conflict,
  };
}

function isKnownEvidence(item) {
  return item
    && typeof item === 'object'
    && [...FACILITY_IDS, ...SPACE_IDS].includes(item.targetId)
    && typeof item.sourceId === 'string'
    && Number.isFinite(item.priority)
    && exactlyOneIntervalKind(item)
    && hasValidCoverage(item)
    && Array.isArray(item.accessRestrictions);
}

function exactlyOneIntervalKind(item) {
  return (item.weeklyIntervals === null) !== (item.dateIntervals === null);
}

function hasValidCoverage(item) {
  const hasStart = item.effectiveStart !== null && item.effectiveStart !== undefined;
  const hasEnd = item.effectiveEnd !== null && item.effectiveEnd !== undefined;
  if (!hasStart && !hasEnd) return true;
  return isDate(item.effectiveStart) && isDate(item.effectiveEnd) && item.effectiveStart <= item.effectiveEnd;
}

function coversDate(item, date) {
  return !hasBoundedRange(item) || (item.effectiveStart <= date && date <= item.effectiveEnd);
}

function hasBoundedRange(item) {
  return item.effectiveStart !== null && item.effectiveStart !== undefined;
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function rangeLength(start, end) {
  return (new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000;
}

function intervalsForWeekday(weeklyIntervals, weekday) {
  return cloneIntervals(weeklyIntervals?.[weekday] || []);
}

function cloneIntervals(intervals) {
  return Array.isArray(intervals) ? intervals.map(interval => [...interval]) : [];
}

function subtractIntervals(baseline, closedIntervals) {
  return closedIntervals.reduce((remaining, [closedStart, closedEnd]) => remaining.flatMap(([start, end]) => {
    if (closedEnd <= start || closedStart >= end) return [[start, end]];
    return [
      ...(start < closedStart ? [[start, closedStart]] : []),
      ...(closedEnd < end ? [[closedEnd, end]] : []),
    ];
  }), cloneIntervals(baseline));
}

function intersectIntervals(left, right) {
  return left.flatMap(([leftStart, leftEnd]) => right.flatMap(([rightStart, rightEnd]) => {
    const start = leftStart > rightStart ? leftStart : rightStart;
    const end = leftEnd < rightEnd ? leftEnd : rightEnd;
    return start < end ? [[start, end]] : [];
  }));
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function weekdayFor(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function easternDates(generated, count) {
  const firstDate = easternDate(generated);
  const first = new Date(`${firstDate}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first.getTime() + index * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function validGeneratedDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('generated must be a valid Date');
  }
  return value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function bySourceId(items) {
  return [...items].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}
