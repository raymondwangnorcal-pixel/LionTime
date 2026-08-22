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

function validateIntervals(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}.intervals must be an array`);
    return;
  }
  let priorEnd = -1;
  for (const [index, interval] of value.entries()) {
    const intervalPath = `${path}.intervals[${index}]`;
    if (!Array.isArray(interval) || interval.length !== 2
      || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) {
      errors.push(`${intervalPath} times must use HH:MM`);
      continue;
    }
    const start = minutes(interval[0]);
    const end = interval[1] === '24:00' ? 1_440 : minutes(interval[1]);
    if (end <= start) {
      errors.push(`${intervalPath} must end after it starts`);
      continue;
    }
    if (start < priorEnd) errors.push(`${path}.intervals must not overlap`);
    priorEnd = end;
  }
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

function validateSourceRefs(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}.sourceRefs must be an array`);
    return false;
  }
  let trusted = true;
  if (!isCanonicalUnique(value)) errors.push(`${path}.sourceRefs must use canonical unique order`);
  for (const [index, sourceRef] of value.entries()) {
    if (!OFFICIAL_SOURCE_IDS.has(sourceRef)) {
      errors.push(`${path}.sourceRefs[${index}] must reference an official source manifest entry`);
      trusted = false;
    }
  }
  return trusted;
}

function validateDay(day, { path, expectedDate, errors, isSpace = false }) {
  if (!isRecord(day)) {
    errors.push(`${path} must be an object`);
    return { intervals: [], status: null, sourceRefs: [], sourceRefsTrusted: false };
  }
  if (day.date !== expectedDate) errors.push(`${path}.date must be ${expectedDate}`);
  validateIntervals(day.intervals, path, errors);
  if (day.status !== null && !STATUS_VALUES.has(day.status)) {
    errors.push(`${path}.status must be null or an approved status`);
  }
  if (Array.isArray(day.intervals) && day.intervals.length > 0) {
    if (typeof day.status === 'string' && day.status.startsWith('Closed')) {
      errors.push(`${path} Closed status cannot include intervals`);
    }
    if (day.status === 'Separate hours not published' || day.status === 'Hours need verification') {
      errors.push(`${path} unavailable status cannot include intervals`);
    }
  }
  if (day.reason !== null && !validText(day.reason)) errors.push(`${path}.reason must be null or bounded plain text`);
  if (day.availabilityType !== null && !AVAILABILITY_TYPES.has(day.availabilityType)) {
    errors.push(`${path}.availabilityType must be null or an approved availability type`);
  }
  validateTextList(day.accessRestrictions, `${path}.accessRestrictions`, errors);
  const sourceRefsTrusted = validateSourceRefs(day.sourceRefs, path, errors);
  if (typeof day.conflict !== 'boolean') errors.push(`${path}.conflict must be boolean`);
  if (day.conflict === true && day.status !== 'Hours need verification') {
    errors.push(`${path}.conflict must use Hours need verification`);
  }
  if (isSpace && Array.isArray(day.intervals) && day.intervals.length > 0
    && (!sourceRefsTrusted || !Array.isArray(day.sourceRefs) || day.sourceRefs.length === 0)) {
    errors.push(`${path} requires room-specific provenance for published intervals`);
  }
  return {
    intervals: Array.isArray(day.intervals) ? day.intervals : [],
    status: day.status,
    sourceRefs: Array.isArray(day.sourceRefs) ? day.sourceRefs : [],
    sourceRefsTrusted,
  };
}

function validateDays(days, { path, startDate, errors, isSpace = false }) {
  if (!Array.isArray(days) || days.length !== 14) {
    errors.push(`${path}.days must contain fourteen consecutive dates`);
    return [];
  }
  return days.map((day, index) => validateDay(day, {
    path: `${path}.days[${index}]`, expectedDate: addDays(startDate, index), errors, isSpace,
  }));
}

function validateFacility(facility, { index, startDate, errors }) {
  const path = `facilities[${index}]`;
  if (!isRecord(facility)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const definition = RECREATION_FACILITIES[facility.id];
  if (!definition) {
    errors.push(`unexpected facility: ${facility.id}`);
    return null;
  }
  if (facility.name !== definition.name) errors.push(`${facility.id}.name does not match catalog`);
  if (facility.kind !== definition.kind) errors.push(`${facility.id}.kind does not match catalog`);
  if (facility.parentId !== (definition.parentId || null)) errors.push(`${facility.id}.parentId does not match catalog`);
  const days = validateDays(facility.days, { path, startDate, errors });

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
        const spaceDefinition = DODGE_SPACES[space.id];
        if (!spaceDefinition) {
          errors.push(`unexpected Dodge space: ${space.id}`);
          return null;
        }
        if (space.name !== spaceDefinition.name) errors.push(`${space.id}.name does not match catalog`);
        return { id: space.id, days: validateDays(space.days, { path: spacePath, startDate, errors, isSpace: true }) };
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

function isClosed(day) {
  return day.intervals.length === 0 && typeof day.status === 'string' && day.status.startsWith('Closed');
}

function validateParentConstraints(facilities, errors) {
  const dodge = facilities.get('dodge');
  const pool = facilities.get('uris-pool');
  if (!dodge || !pool) return;
  for (let index = 0; index < Math.min(dodge.days.length, pool.days.length, 14); index += 1) {
    const dodgeDay = dodge.days[index];
    const poolDay = pool.days[index];
    if (isClosed(dodgeDay) && poolDay.intervals.length > 0) {
      errors.push(`uris-pool day ${index} pool cannot open while Dodge is closed`);
    } else if (poolDay.intervals.some(interval => !intervalIsWithin(interval, dodgeDay.intervals))) {
      errors.push(`uris-pool day ${index} intervals must be within Dodge hours`);
    }
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
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
