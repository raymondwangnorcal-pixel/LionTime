import {
  ACCESS_TYPES,
  SOURCE_FAILURE_CODES,
  SOURCE_VENUE_IDS,
  STUDENT_SERVICES_SOURCE_IDS,
  STUDENT_SERVICES_SOURCE_URLS,
  STUDENT_SERVICES_VENUES,
} from './student-services-hours-catalog.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AWARE_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;
const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const STATUS_VALUES = new Set(['Closed', 'Needs verification']);

function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','); }
function plain(value, limit = 200) {
  return typeof value === 'string' && value.trim() && value.length <= limit && !/[<>\u0000-\u001f]/.test(value);
}
function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function addDays(value, amount) {
  if (!validDate(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function validTimestamp(value) { return typeof value === 'string' && AWARE_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)); }
function minutes(value) { return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); }

function validateIntervals(value, path, errors) {
  if (!Array.isArray(value)) { errors.push(`${path} must be an array`); return; }
  let priorEnd = -1;
  value.forEach((interval, index) => {
    if (!Array.isArray(interval) || interval.length !== 2 || !OPEN_TIME.test(interval[0] || '')
      || !CLOSE_TIME.test(interval[1] || '')) {
      errors.push(`${path}[${index}] must contain HH:MM times`); return;
    }
    const start = minutes(interval[0]);
    const end = interval[1] === '24:00' ? 1440 : minutes(interval[1]);
    if (end <= start) errors.push(`${path}[${index}] must not cross midnight`);
    if (start < priorEnd) errors.push(`${path} must not overlap`);
    priorEnd = end;
  });
}

function validateAvailability(value, path, errors) {
  if (!exact(value, ['type', 'intervals', 'status', 'reason'])) { errors.push(`${path} has unexpected fields`); return; }
  if (!ACCESS_TYPES.includes(value.type)) errors.push(`${path}.type is invalid`);
  validateIntervals(value.intervals, `${path}.intervals`, errors);
  if (value.status !== null && !STATUS_VALUES.has(value.status)) errors.push(`${path}.status is invalid`);
  if (value.reason !== null && !plain(value.reason)) errors.push(`${path}.reason must be bounded plain text`);
  if (value.status === 'Closed' && value.intervals.length) errors.push(`${path} closed availability cannot contain intervals`);
}

function validateVenue(value, { path, sourceId, expectedStart, errors }) {
  if (!exact(value, ['id', 'name', 'location', 'days'])) { errors.push(`${path} has unexpected fields`); return; }
  const contract = STUDENT_SERVICES_VENUES[value.id];
  if (!contract || contract.sourceId !== sourceId) errors.push(`${path}.id is not owned by ${sourceId}`);
  else if (value.name !== contract.name || value.location !== contract.location) errors.push(`${path} identity does not match catalog`);
  if (!Array.isArray(value.days) || value.days.length !== 14) { errors.push(`${path}.days must contain fourteen dates`); return; }
  value.days.forEach((day, dayIndex) => {
    const dayPath = `${path}.days[${dayIndex}]`;
    if (!exact(day, ['date', 'availabilities', 'sourceRefs', 'evidenceRefs'])) { errors.push(`${dayPath} has unexpected fields`); return; }
    if (day.date !== addDays(expectedStart, dayIndex)) errors.push(`${dayPath}.date is not consecutive`);
    if (!Array.isArray(day.availabilities)) errors.push(`${dayPath}.availabilities must be an array`);
    else day.availabilities.forEach((item, index) => validateAvailability(item, `${dayPath}.availabilities[${index}]`, errors));
    if (!Array.isArray(day.sourceRefs) || day.sourceRefs.length !== 1 || day.sourceRefs[0] !== sourceId) {
      errors.push(`${dayPath}.sourceRefs must identify ${sourceId}`);
    }
    if (!Array.isArray(day.evidenceRefs) || day.evidenceRefs.some(ref => !plain(ref)
      || !ref.startsWith(`${sourceId}:${value.id}:`))) errors.push(`${dayPath}.evidenceRefs are untrusted`);
  });
}

function validateVenueSet(venues, sourceId, expectedStart, path, errors) {
  if (!Array.isArray(venues)) { errors.push(`${path} must be an array`); return; }
  const expected = SOURCE_VENUE_IDS[sourceId];
  const ids = venues.map(venue => venue?.id);
  if (ids.join(',') !== expected.join(',')) errors.push(`${path} must contain every ${sourceId} venue in canonical order`);
  venues.forEach((venue, index) => validateVenue(venue, { path: `${path}[${index}]`, sourceId, expectedStart, errors }));
}

export function validateStudentServicesAttemptBatch(value) {
  const errors = [];
  if (!exact(value, ['schemaVersion', 'generated', 'windowStart', 'windowEnd', 'attempts'])) return { ok: false, errors: ['attempt batch has unexpected fields'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!validTimestamp(value.generated)) errors.push('generated must be timezone-aware');
  if (!validDate(value.windowStart) || value.windowEnd !== addDays(value.windowStart, 13)) errors.push('batch window must contain fourteen dates');
  if (!Array.isArray(value.attempts) || value.attempts.length !== 4) errors.push('attempts must contain four sources');
  else value.attempts.forEach((attempt, index) => {
    const path = `attempts[${index}]`;
    if (!exact(attempt, ['sourceId', 'sourceUrl', 'attemptedAt', 'result', 'failureCode', 'venues'])) { errors.push(`${path} has unexpected fields`); return; }
    const sourceId = STUDENT_SERVICES_SOURCE_IDS[index];
    if (attempt.sourceId !== sourceId || attempt.sourceUrl !== STUDENT_SERVICES_SOURCE_URLS[sourceId]) errors.push(`${path} source identity is invalid`);
    if (!validTimestamp(attempt.attemptedAt) || attempt.attemptedAt !== value.generated) errors.push(`${path}.attemptedAt must equal generated`);
    if (attempt.result === 'success') {
      if (attempt.failureCode !== null) errors.push(`${path} success cannot have a failure code`);
      validateVenueSet(attempt.venues, sourceId, value.windowStart, `${path}.venues`, errors);
    } else if (attempt.result === 'failure') {
      if (!SOURCE_FAILURE_CODES.includes(attempt.failureCode) || !Array.isArray(attempt.venues) || attempt.venues.length) {
        errors.push(`${path} failure must use a bounded code and no venues`);
      }
    } else errors.push(`${path}.result is invalid`);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateStudentServicesSnapshot(value) {
  const errors = [];
  if (!exact(value, ['schemaVersion', 'generated', 'windowStart', 'windowEnd', 'sources'])) return { ok: false, errors: ['snapshot has unexpected fields'] };
  if (value.schemaVersion !== 1 || !validTimestamp(value.generated)) errors.push('snapshot metadata is invalid');
  if (!validDate(value.windowStart) || value.windowEnd !== addDays(value.windowStart, 13)) errors.push('snapshot window is invalid');
  if (!Array.isArray(value.sources) || value.sources.length !== 4) errors.push('sources must contain four records');
  else value.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    if (!exact(source, ['sourceId', 'sourceUrl', 'lastAttemptAt', 'lastAttemptResult', 'failureCode', 'lastSuccessAt', 'venues'])) {
      errors.push(`${path} has unexpected fields`); return;
    }
    const sourceId = STUDENT_SERVICES_SOURCE_IDS[index];
    if (source.sourceId !== sourceId || source.sourceUrl !== STUDENT_SERVICES_SOURCE_URLS[sourceId]) errors.push(`${path} source identity is invalid`);
    if (!validTimestamp(source.lastAttemptAt) || !['success', 'failure'].includes(source.lastAttemptResult)) errors.push(`${path} attempt metadata is invalid`);
    if (source.lastAttemptResult === 'success' && source.failureCode !== null) errors.push(`${path} successful attempt cannot have a failure code`);
    if (source.lastAttemptResult === 'failure' && !SOURCE_FAILURE_CODES.includes(source.failureCode)) errors.push(`${path} failure code is invalid`);
    if (source.lastSuccessAt === null) {
      if (!Array.isArray(source.venues) || source.venues.length) errors.push(`${path} uninitialized source cannot have venues`);
    } else if (!validTimestamp(source.lastSuccessAt)) errors.push(`${path}.lastSuccessAt is invalid`);
    else {
      const start = source.venues?.[0]?.days?.[0]?.date;
      if (!validDate(start)) errors.push(`${path} venue window is missing`);
      else validateVenueSet(source.venues, sourceId, start, `${path}.venues`, errors);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
