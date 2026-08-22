import {
  DODGE_SPACES,
  RECREATION_FACILITIES,
  RECREATION_SOURCE_URLS,
} from './recreation-hours-catalog.js';

const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE_AWARE_ISO = /(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_TEXT_LENGTH = 200;
const STATUS_VALUES = new Set([
  'Open',
  'Closing soon',
  'Closed',
  'Closed for maintenance',
  'Closed for Athletics event',
  'Reservation required',
  'Separate hours not published',
  'Hours need verification',
]);
const AVAILABILITY_TYPES = new Set([
  'facility-hours',
  'open-recreation',
  'lap-swim',
  'recreation-swim',
  'reservation-required',
]);
const OFFICIAL_SOURCE_IDS = new Set(Object.keys(RECREATION_SOURCE_URLS));
const COLUMBIA_SOURCE_IDS = new Set(['columbiaHours', 'columbiaModifications']);
const UNAVAILABLE_STATUSES = new Set(['Separate hours not published', 'Hours need verification']);
const RESTRICTION_STATUS_VALUES = new Set([
  'Closed',
  'Closed for maintenance',
  'Closed for Athletics event',
  'Reservation required',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date, count) {
  if (!isDate(date)) return null;
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

function easternDate(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(parsed);
  const part = type => parts.find(entry => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function minutes(time) {
  const [hours, minutesPart] = time.split(':').map(Number);
  return hours * 60 + minutesPart;
}

function validText(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAX_TEXT_LENGTH
    && !/[<>\u0000-\u001f]/.test(value);
}

function isCanonicalUnique(values) {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

function validateExactKeys(value, keys, path, errors) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) errors.push(`${path} contains unexpected field: ${key}`);
  }
}

function validateIntervals(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}.intervals must be an array`);
    return false;
  }
  let valid = true;
  let priorEnd = -1;
  for (const [index, interval] of value.entries()) {
    const intervalPath = `${path}.intervals[${index}]`;
    if (!Array.isArray(interval) || interval.length !== 2
      || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) {
      errors.push(`${intervalPath} times must use HH:MM`);
      valid = false;
      continue;
    }
    const start = minutes(interval[0]);
    const end = interval[1] === '24:00' ? 1_440 : minutes(interval[1]);
    if (end <= start) {
      errors.push(`${intervalPath} must end after it starts`);
      valid = false;
      continue;
    }
    if (start < priorEnd) {
      errors.push(`${path}.intervals must not overlap`);
      valid = false;
    }
    priorEnd = end;
  }
  return valid;
}

function validateTextList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  if (!isCanonicalUnique(value)) errors.push(`${path} must use canonical unique order`);
  for (const [index, item] of value.entries()) {
    if (!validText(item)) errors.push(`${path}[${index}] must be bounded plain text`);
  }
}

function allowedSourcesFor(targetId) {
  return targetId === 'barnard-fitness' ? new Set(['barnardFitness']) : COLUMBIA_SOURCE_IDS;
}

function validateSourceRefs(value, { path, targetId, errors }) {
  if (!Array.isArray(value)) {
    errors.push(`${path}.sourceRefs must be an array`);
    return { trusted: false, allowed: false, present: false };
  }
  let trusted = true;
  let allowed = true;
  if (!isCanonicalUnique(value)) errors.push(`${path}.sourceRefs must use canonical unique order`);
  for (const [index, sourceRef] of value.entries()) {
    if (!OFFICIAL_SOURCE_IDS.has(sourceRef)) {
      errors.push(`${path}.sourceRefs[${index}] must reference an official source manifest entry`);
      trusted = false;
    } else if (!allowedSourcesFor(targetId).has(sourceRef)) {
      errors.push(`${path}.sourceRefs[${index}] is not allowed for ${targetId}`);
      allowed = false;
    }
  }
  return { trusted, allowed, present: value.length > 0 };
}

function validateEvidenceRefs(value, { path, targetId, isDodgeChild, sourceRefs, errors }) {
  if (!Array.isArray(value)) {
    errors.push(`${path}.evidenceRefs must be an array`);
    return { trusted: false, present: false, targetSpecific: false };
  }
  if (!isCanonicalUnique(value)) errors.push(`${path}.evidenceRefs must use canonical unique order`);
  let trusted = true;
  let targetSpecific = false;
  for (const [index, evidenceRef] of value.entries()) {
    const evidencePath = `${path}.evidenceRefs[${index}]`;
    if (typeof evidenceRef !== 'string') {
      errors.push(`${evidencePath} must be a trusted target-specific evidence identity`);
      trusted = false;
      continue;
    }
    const separator = evidenceRef.indexOf(':');
    const sourceId = separator > 0 ? evidenceRef.slice(0, separator) : '';
    const evidenceTarget = separator > 0 ? evidenceRef.slice(separator + 1) : '';
    const allowedTarget = evidenceTarget === targetId || (isDodgeChild && evidenceTarget === 'dodge');
    if (!OFFICIAL_SOURCE_IDS.has(sourceId)
      || !Object.hasOwn({ ...RECREATION_FACILITIES, ...DODGE_SPACES }, evidenceTarget)
      || !allowedSourcesFor(evidenceTarget).has(sourceId)
      || evidenceRef !== `${sourceId}:${evidenceTarget}`
      || !allowedTarget) {
      errors.push(`${evidencePath} must be a trusted target-specific evidence identity for ${targetId}`);
      trusted = false;
      continue;
    }
    if (!sourceRefs.includes(sourceId)) {
      errors.push(`${evidencePath} must correspond to ${path}.sourceRefs`);
      trusted = false;
    }
    if (evidenceTarget === targetId) targetSpecific = true;
  }
  for (const sourceRef of sourceRefs) {
    if (!value.some(evidenceRef => evidenceRef.startsWith(`${sourceRef}:`))) {
      errors.push(`${path}.sourceRefs must correspond to trusted evidence identities`);
      trusted = false;
    }
  }
  return { trusted, present: value.length > 0, targetSpecific };
}

function availabilityAllowedFor(targetId, availabilityType) {
  if (availabilityType === null) return true;
  if (targetId === 'uris-pool') return ['lap-swim', 'recreation-swim', 'reservation-required'].includes(availabilityType);
  if (Object.hasOwn(DODGE_SPACES, targetId)) return ['open-recreation', 'reservation-required'].includes(availabilityType);
  return ['facility-hours', 'reservation-required'].includes(availabilityType);
}

function validateRestriction(restriction, {
  path, targetId, isDodgeChild, dayIntervals, errors,
}) {
  if (!isRecord(restriction)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  validateExactKeys(restriction, new Set([
    'targetId', 'intervals', 'status', 'reason', 'availabilityType', 'accessRestrictions', 'sourceRefs', 'evidenceRefs',
  ]), path, errors);
  const restrictionTargetAllowed = restriction.targetId === targetId
    || (isDodgeChild && restriction.targetId === 'dodge');
  if (!restrictionTargetAllowed) {
    errors.push(`${path}.targetId must identify ${targetId} or its Dodge parent`);
  }
  const validIntervals = validateIntervals(restriction.intervals, path, errors);
  if (validIntervals && restriction.intervals.length === 0) {
    errors.push(`${path}.intervals must contain a restriction window`);
  }
  if (validIntervals && restriction.intervals.some(window => dayIntervals.some(interval => intervalsOverlap(window, interval)))) {
    errors.push(`${path} restriction windows must not overlap residual operating intervals`);
  }
  if (!RESTRICTION_STATUS_VALUES.has(restriction.status)) {
    errors.push(`${path}.status must be an approved restriction status`);
  }
  if (restriction.reason !== null && !validText(restriction.reason)) {
    errors.push(`${path}.reason must be null or bounded plain text`);
  }
  if (restriction.availabilityType !== null && !AVAILABILITY_TYPES.has(restriction.availabilityType)) {
    errors.push(`${path}.availabilityType must be null or an approved availability type`);
  } else if (restrictionTargetAllowed && !availabilityAllowedFor(restriction.targetId, restriction.availabilityType)) {
    errors.push(`${path}.availabilityType is not valid for ${restriction.targetId}`);
  }
  if (restriction.status === 'Reservation required' && restriction.availabilityType !== 'reservation-required') {
    errors.push(`${path}.Reservation required must use reservation-required availability`);
  }
  validateTextList(restriction.accessRestrictions, `${path}.accessRestrictions`, errors);
  const provenance = validateSourceRefs(restriction.sourceRefs, {
    path, targetId: restriction.targetId, errors,
  });
  const evidence = validateEvidenceRefs(restriction.evidenceRefs, {
    path,
    targetId: restriction.targetId,
    isDodgeChild: false,
    sourceRefs: Array.isArray(restriction.sourceRefs) ? restriction.sourceRefs : [],
    errors,
  });
  if (!provenance.trusted || !provenance.allowed || !provenance.present
    || !evidence.trusted || !evidence.present || !evidence.targetSpecific) {
    errors.push(`${path} requires trusted target-specific evidence`);
  }
  return validIntervals ? restriction : null;
}

function validateRestrictions(value, options) {
  const { path, errors } = options;
  if (!Array.isArray(value)) {
    errors.push(`${path}.restrictions must be an array`);
    return [];
  }
  if (!isCanonicalUnique(value.map(item => JSON.stringify(item)))) {
    errors.push(`${path}.restrictions must use canonical unique order`);
  }
  const restrictions = value.map((restriction, index) => validateRestriction(restriction, {
    ...options, path: `${path}.restrictions[${index}]`,
  })).filter(Boolean);
  const windows = restrictions.flatMap(restriction => restriction.intervals)
    .sort(([left], [right]) => left.localeCompare(right));
  if (windows.some((window, index) => index > 0 && intervalsOverlap(window, windows[index - 1]))) {
    errors.push(`${path}.restriction windows must not overlap each other`);
  }
  return restrictions;
}

function validateDay(day, { path, expectedDate, errors, targetId, isSpace = false, isDodgeChild = false }) {
  if (!isRecord(day)) {
    errors.push(`${path} must be an object`);
    return {
      validIntervals: false, intervals: [], status: null, reason: null, sourceRefs: [], evidenceRefs: [], restrictions: [], conflict: false,
      reservationStatusMismatched: false,
    };
  }
  validateExactKeys(day, new Set([
    'date', 'intervals', 'status', 'reason', 'availabilityType', 'accessRestrictions', 'sourceRefs', 'evidenceRefs', 'restrictions', 'conflict',
  ]), path, errors);
  if (day.date !== expectedDate) errors.push(`${path}.date must be ${expectedDate}`);
  const validIntervals = validateIntervals(day.intervals, path, errors);
  if (day.status !== null && !STATUS_VALUES.has(day.status)) {
    errors.push(`${path}.status must be null or an approved status`);
  }
  if (validIntervals && day.intervals.length > 0) {
    if (typeof day.status === 'string' && day.status.startsWith('Closed')) {
      errors.push(`${path} Closed status cannot include intervals`);
    }
    if (day.status === 'Separate hours not published' || day.status === 'Hours need verification') {
      errors.push(`${path} unavailable status cannot include intervals`);
    }
  }
  if ((day.status === 'Open' || day.status === 'Closing soon')
    && (!validIntervals || day.intervals.length === 0)) {
    errors.push(`${path}.${day.status} status requires operating intervals`);
  }
  if (day.status === 'Separate hours not published' && !isSpace) {
    errors.push(`${path}.Separate hours not published is only valid for Dodge spaces`);
  }
  if (day.reason !== null && !validText(day.reason)) errors.push(`${path}.reason must be null or bounded plain text`);
  if (day.availabilityType !== null && !AVAILABILITY_TYPES.has(day.availabilityType)) {
    errors.push(`${path}.availabilityType must be null or an approved availability type`);
  } else if (!availabilityAllowedFor(targetId, day.availabilityType)) {
    errors.push(`${path}.availabilityType is not valid for ${targetId}`);
  }
  const reservationStatusMismatched = day.status === 'Reservation required'
    && day.availabilityType !== 'reservation-required';
  if (reservationStatusMismatched && !isDodgeChild) {
    errors.push(`${path}.Reservation required must use reservation-required availability`);
  }
  validateTextList(day.accessRestrictions, `${path}.accessRestrictions`, errors);
  const provenance = validateSourceRefs(day.sourceRefs, { path, targetId, errors });
  const evidence = validateEvidenceRefs(day.evidenceRefs, {
    path,
    targetId,
    isDodgeChild,
    sourceRefs: Array.isArray(day.sourceRefs) ? day.sourceRefs : [],
    errors,
  });
  const restrictions = validateRestrictions(day.restrictions, {
    path,
    targetId,
    isDodgeChild,
    dayIntervals: validIntervals ? day.intervals : [],
    errors,
  });
  if (typeof day.conflict !== 'boolean') errors.push(`${path}.conflict must be boolean`);
  const requiresProvenance = day.status === null
    || day.conflict === true
    || !UNAVAILABLE_STATUSES.has(day.status)
    || (validIntervals && day.intervals.length > 0)
    || day.availabilityType !== null
    || day.reason !== null
    || (Array.isArray(day.accessRestrictions) && day.accessRestrictions.length > 0);
  if (requiresProvenance && (!provenance.trusted || !provenance.allowed || !provenance.present
    || !evidence.trusted || !evidence.present)) {
    errors.push(`${path} requires official provenance`);
  }
  if (validIntervals && day.intervals.length > 0 && !evidence.targetSpecific) {
    errors.push(`${path} requires target-specific evidence for published intervals`);
  }
  return {
    validIntervals,
    intervals: validIntervals ? day.intervals : [],
    status: day.status,
    reason: day.reason,
    sourceRefs: Array.isArray(day.sourceRefs) ? day.sourceRefs : [],
    evidenceRefs: Array.isArray(day.evidenceRefs) ? day.evidenceRefs : [],
    restrictions,
    conflict: day.conflict,
    hasOfficialProvenance: provenance.trusted && provenance.allowed && provenance.present
      && evidence.trusted && evidence.present,
    hasTargetSpecificEvidence: evidence.targetSpecific,
    reservationStatusMismatched,
    path,
  };
}

function validateDays(days, { path, startDate, errors, targetId, isSpace = false, isDodgeChild = false }) {
  if (!Array.isArray(days) || days.length !== 14) {
    errors.push(`${path}.days must contain fourteen consecutive dates`);
    return [];
  }
  return days.map((day, index) => validateDay(day, {
    path: `${path}.days[${index}]`, expectedDate: addDays(startDate, index), errors, targetId, isSpace, isDodgeChild,
  }));
}

function validateFacility(facility, { index, startDate, errors }) {
  const path = `facilities[${index}]`;
  if (!isRecord(facility)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (typeof facility.id !== 'string' || !Object.hasOwn(RECREATION_FACILITIES, facility.id)) {
    errors.push(`unexpected facility: ${facility.id}`);
    return null;
  }
  const definition = RECREATION_FACILITIES[facility.id];
  validateExactKeys(facility, new Set(['id', 'name', 'kind', 'parentId', 'days', 'spaces']), path, errors);
  if (facility.name !== definition.name) errors.push(`${facility.id}.name does not match catalog`);
  if (facility.kind !== definition.kind) errors.push(`${facility.id}.kind does not match catalog`);
  if (facility.parentId !== (definition.parentId || null)) errors.push(`${facility.id}.parentId does not match catalog`);
  const days = validateDays(facility.days, {
    path, startDate, errors, targetId: facility.id, isDodgeChild: facility.id === 'uris-pool',
  });

  let spaces = [];
  if (facility.id === 'dodge') {
    if (!Array.isArray(facility.spaces)) {
      errors.push(`${path}.spaces must be an array`);
    } else {
      const seenSpaceIds = new Set();
      spaces = facility.spaces.map((space, spaceIndex) => {
        const spacePath = `${path}.spaces[${spaceIndex}]`;
        if (!isRecord(space)) {
          errors.push(`${spacePath} must be an object`);
          return null;
        }
        if (typeof space.id !== 'string' || seenSpaceIds.has(space.id)) errors.push(`${spacePath}.id must be unique`);
        seenSpaceIds.add(space.id);
        if (typeof space.id !== 'string' || !Object.hasOwn(DODGE_SPACES, space.id)) {
          errors.push(`unexpected Dodge space: ${space.id}`);
          return null;
        }
        const spaceDefinition = DODGE_SPACES[space.id];
        validateExactKeys(space, new Set(['id', 'name', 'days']), spacePath, errors);
        if (space.name !== spaceDefinition.name) errors.push(`${space.id}.name does not match catalog`);
        return {
          id: space.id,
          days: validateDays(space.days, {
            path: spacePath, startDate, errors, targetId: space.id, isSpace: true, isDodgeChild: true,
          }),
        };
      });
      for (const id of Object.keys(DODGE_SPACES)) {
        if (!seenSpaceIds.has(id)) errors.push(`missing required Dodge space: ${id}`);
      }
    }
  } else if ('spaces' in facility && facility.spaces !== undefined) {
    errors.push(`${path}.spaces is only allowed for Dodge`);
  }
  return { id: facility.id, days, spaces };
}

function intervalIsWithin(interval, parentIntervals) {
  return parentIntervals.some(([parentStart, parentEnd]) => parentStart <= interval[0] && interval[1] <= parentEnd);
}

function intervalsOverlap(left, right) {
  return left[0] < right[1] && right[0] < left[1];
}

function includesAll(values, required) {
  return required.every(value => values.includes(value));
}

function isVerifiedDodgeClosure(day) {
  return day.validIntervals
    && day.intervals.length === 0
    && day.restrictions.length === 0
    && day.conflict === false
    && day.status !== 'Hours need verification'
    && day.hasOfficialProvenance;
}

function isUnresolvedDodge(day) {
  return day.conflict === true || day.status === 'Hours need verification';
}

function validateNormalConflictStatus(day, errors) {
  if (day.conflict === true && day.status !== 'Hours need verification') {
    errors.push(`${day.path}.conflict must use Hours need verification`);
  }
}

function validateIndependentReservationStatus(day, errors) {
  if (day.reservationStatusMismatched) {
    errors.push(`${day.path}.Reservation required must use reservation-required availability`);
  }
}

function validateInheritedClosure({ child, parent, targetId, index, errors }) {
  const expectedStatus = parent.status || 'Closed';
  if (!child.validIntervals || child.intervals.length > 0) {
    const label = targetId === 'uris-pool' ? 'pool' : targetId;
    errors.push(`${targetId} day ${index} ${label} cannot open while Dodge is closed`);
  }
  if (child.status !== expectedStatus) errors.push(`${targetId} day ${index} must inherit Dodge closure status`);
  if (child.reason !== parent.reason) errors.push(`${targetId} day ${index} must inherit Dodge closure reason`);
  if (!includesAll(child.sourceRefs, parent.sourceRefs)) {
    errors.push(`${targetId} day ${index} must retain Dodge closure provenance`);
  }
  if (!includesAll(child.evidenceRefs, parent.evidenceRefs)) {
    errors.push(`${targetId} day ${index} must retain Dodge closure evidence identity`);
  }
}

function isUnavailableChild(child) {
  return child.validIntervals
    && child.intervals.length === 0
    && UNAVAILABLE_STATUSES.has(child.status)
    && child.conflict === false;
}

function validateUnresolvedParent({ child, parent, targetId, index, errors, isSpace }) {
  if (isUnavailableChild(child)) {
    for (const restriction of parent.restrictions) {
      if (!child.restrictions.some(candidate => JSON.stringify(candidate) === JSON.stringify(restriction))) {
        errors.push(`${targetId} day ${index} must retain known Dodge restriction windows`);
      }
    }
    return;
  }
  if (!child.validIntervals || child.intervals.length > 0) {
    errors.push(`${targetId} day ${index} cannot publish intervals while Dodge is unresolved`);
  }
  if (child.status !== 'Hours need verification') {
    errors.push(`${targetId} day ${index} must inherit Dodge unresolved status`);
  }
  if (child.reason !== parent.reason) errors.push(`${targetId} day ${index} must inherit Dodge unresolved reason`);
  if (child.conflict !== true) errors.push(`${targetId} day ${index} must inherit Dodge unresolved conflict`);
  if (!includesAll(child.sourceRefs, parent.sourceRefs)) {
    errors.push(`${targetId} day ${index} must retain Dodge unresolved provenance`);
  }
  if (!includesAll(child.evidenceRefs, parent.evidenceRefs)) {
    errors.push(`${targetId} day ${index} must retain Dodge unresolved evidence identity`);
  }
}

function validateChildAgainstDodge({ child, parent, targetId, index, errors, isSpace }) {
  if (!parent.validIntervals || !child.validIntervals) {
    validateNormalConflictStatus(child, errors);
    validateIndependentReservationStatus(child, errors);
    return;
  }
  if (isVerifiedDodgeClosure(parent)) {
    validateInheritedClosure({ child, parent, targetId, index, errors });
    return;
  }
  if (isUnresolvedDodge(parent)) {
    validateUnresolvedParent({ child, parent, targetId, index, errors, isSpace });
  } else if (child.intervals.some(interval => !intervalIsWithin(interval, parent.intervals))) {
    errors.push(`${targetId} day ${index} intervals must be within Dodge hours`);
  }
  validateNormalConflictStatus(child, errors);
  validateIndependentReservationStatus(child, errors);
}

function validateParentConstraints(facilities, errors) {
  const dodge = facilities.get('dodge');
  const pool = facilities.get('uris-pool');
  if (!dodge || !pool) return;
  const children = [
    { id: 'uris-pool', days: pool.days, isSpace: false },
    ...dodge.spaces.filter(Boolean).map(space => ({ id: space.id, days: space.days, isSpace: true })),
  ];
  for (let index = 0; index < Math.min(dodge.days.length, 14); index += 1) {
    const dodgeDay = dodge.days[index];
    for (const child of children) {
      if (!child.days[index]) continue;
      validateChildAgainstDodge({
        child: child.days[index], parent: dodgeDay, targetId: child.id, index, errors, isSpace: child.isSpace,
      });
    }
  }
}

function validateTopLevelConflictStatuses(facilities, errors) {
  for (const [id, facility] of facilities) {
    if (id === 'uris-pool') continue;
    for (const day of facility.days) validateNormalConflictStatus(day, errors);
  }
}

/**
 * Validates a complete, already-resolved Recreation snapshot. This function
 * deliberately performs no coercion or repair so an invalid upload cannot be
 * transformed into a value eligible for persistence.
 */
export function validateRecreationHoursSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['snapshot must be an object'] };
  validateExactKeys(value, new Set(['generated', 'facilities']), 'snapshot', errors);
  const startDate = easternDate(value.generated);
  if (!startDate || typeof value.generated !== 'string' || !TIMEZONE_AWARE_ISO.test(value.generated)) {
    errors.push('generated must be a timezone-aware ISO timestamp');
  }
  if (!Array.isArray(value.facilities)) {
    errors.push('facilities must be an array');
    return { ok: false, errors };
  }

  const facilities = new Map();
  const seenIds = new Set();
  for (const [index, facility] of value.facilities.entries()) {
    if (isRecord(facility)) {
      if (typeof facility.id !== 'string' || seenIds.has(facility.id)) errors.push(`facilities[${index}].id must be unique`);
      seenIds.add(facility.id);
    }
    const validated = validateFacility(facility, { index, startDate, errors });
    if (validated && !facilities.has(validated.id)) facilities.set(validated.id, validated);
  }
  for (const id of Object.keys(RECREATION_FACILITIES)) {
    if (!seenIds.has(id)) errors.push(`missing required facility: ${id}`);
  }
  validateParentConstraints(facilities, errors);
  validateTopLevelConflictStatuses(facilities, errors);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
