import {
  LEGACY_DINING_LOCATION_CONTRACT,
  LEGACY_DINING_SOURCE_CONTRACT,
  DINING_SOURCE_CONTRACT_V3,
  DINING_SOURCE_CONTRACT,
  validateDiningHoursSnapshot,
} from './dining-hours-schema.js';

export const DINING_SOURCE_IDS = Object.freeze(Object.keys(DINING_SOURCE_CONTRACT));
export const DINING_SOURCE_IDS_V3 = Object.freeze(Object.keys(DINING_SOURCE_CONTRACT_V3));
export const LEGACY_DINING_SOURCE_IDS = Object.freeze(Object.keys(LEGACY_DINING_SOURCE_CONTRACT));
export const DINING_FAILURE_CODES = Object.freeze([
  'challenge', 'navigation', 'timeout', 'missing-content', 'parse', 'unexpected',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AWARE_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;
const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys) {
  return record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function plain(value, limit = 240) {
  return typeof value === 'string' && value.trim() && value.length <= limit
    && !/[<>\u0000-\u001f]/.test(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && AWARE_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
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

function minutes(value) {
  return value === '24:00' ? 1440 : Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function validateIntervals(value, path, errors, { increasing = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  let priorEnd = -1;
  value.forEach((interval, index) => {
    if (!Array.isArray(interval) || interval.length !== 2
      || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) {
      errors.push(`${path}[${index}] must contain HH:MM times`);
      return;
    }
    const start = minutes(interval[0]);
    let end = minutes(interval[1]);
    if (increasing && end <= start) errors.push(`${path}[${index}] must increase`);
    if (!increasing && end <= start) end += 1440;
    if (start < priorEnd) errors.push(`${path} must not overlap`);
    priorEnd = end;
  });
}

function validateLocationsPayload(value, batch, path, errors) {
  if (!exact(value, ['schemaVersion', 'generated', 'source', 'windowStart', 'windowEnd', 'locations'])) {
    errors.push(`${path} has unexpected fields`);
    return;
  }
  const validation = validateDiningHoursSnapshot(value);
  if (!validation.ok) errors.push(...validation.errors.map(error => `${path}: ${error}`));
  if (value.schemaVersion !== 1 || value.generated !== batch.generated
    || value.windowStart !== batch.windowStart || value.windowEnd !== batch.windowEnd) {
    errors.push(`${path} metadata must match its attempt batch`);
  }
  value.locations?.forEach((location, locationIndex) => {
    if (!exact(location, ['id', 'sourceId', 'name', 'category', 'days'])) {
      errors.push(`${path}.locations[${locationIndex}] has unexpected fields`);
    }
    location?.days?.forEach((day, dayIndex) => {
      if (!exact(day, ['date', 'intervals', 'status'])) {
        errors.push(`${path}.locations[${locationIndex}].days[${dayIndex}] has unexpected fields`);
      }
    });
  });
}

function validateNsopPayload(value, path, errors) {
  if (!exact(value, ['id', 'name', 'audience', 'countsAsOpen', 'days'])
    || value.id !== 'nsop-2026' || value.countsAsOpen !== false
    || !plain(value.name, 120) || !plain(value.audience)) {
    errors.push(`${path} has invalid NSOP metadata`);
    return;
  }
  const expectedDates = [
    '2026-08-29', '2026-08-30', '2026-08-31',
    '2026-09-01', '2026-09-02', '2026-09-03',
  ];
  if (!Array.isArray(value.days) || value.days.length !== expectedDates.length) {
    errors.push(`${path}.days must contain the six official dates`);
    return;
  }
  value.days.forEach((day, dayIndex) => {
    const dayPath = `${path}.days[${dayIndex}]`;
    if (!exact(day, ['date', 'status', 'sessions']) || day.date !== expectedDates[dayIndex]
      || !plain(day.status, 200) || !Array.isArray(day.sessions) || day.sessions.length > 3) {
      errors.push(`${dayPath} is invalid`);
      return;
    }
    day.sessions.forEach((session, sessionIndex) => {
      const sessionPath = `${dayPath}.sessions[${sessionIndex}]`;
      if (!exact(session, ['label', 'open', 'close']) || !plain(session.label, 80)
        || !OPEN_TIME.test(session.open || '') || !CLOSE_TIME.test(session.close || '')
        || minutes(session.close) <= minutes(session.open)) errors.push(`${sessionPath} is invalid`);
    });
  });
}

function validateLaborPayload(value, path, errors) {
  if (!exact(value, ['id', 'days']) || value.id !== 'labor-day-2026') {
    errors.push(`${path} has invalid Labor Day metadata`);
    return;
  }
  const expectedDates = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];
  if (!Array.isArray(value.days) || value.days.length !== expectedDates.length) {
    errors.push(`${path}.days must contain Labor Day weekend`);
    return;
  }
  const venueIds = new Set(Object.values(LEGACY_DINING_LOCATION_CONTRACT).map(contract => contract.id));
  value.days.forEach((day, dayIndex) => {
    const dayPath = `${path}.days[${dayIndex}]`;
    if (!exact(day, ['date', 'venues']) || day.date !== expectedDates[dayIndex] || !record(day.venues)) {
      errors.push(`${dayPath} is invalid`);
      return;
    }
    for (const [venueId, intervals] of Object.entries(day.venues)) {
      if (!venueIds.has(venueId)) errors.push(`${dayPath} contains an unknown venue`);
      validateIntervals(intervals, `${dayPath}.venues.${venueId}`, errors, { increasing: true });
    }
  });
}

function validateFallPayload(value, path, errors) {
  if (!exact(value, ['id', 'start', 'end', 'venues']) || value.id !== 'fall-2026'
    || value.start !== '2026-09-08' || value.end !== '2026-12-23' || !record(value.venues)) {
    errors.push(`${path} has invalid Fall metadata`);
    return;
  }
  const venueIds = new Set(Object.values(LEGACY_DINING_LOCATION_CONTRACT).map(contract => contract.id));
  if (Object.keys(value.venues).length !== 15) errors.push(`${path}.venues must contain fifteen locations`);
  for (const [venueId, weekdays] of Object.entries(value.venues)) {
    if (!venueIds.has(venueId) || !exact(weekdays, ['0', '1', '2', '3', '4', '5', '6'])) {
      errors.push(`${path}.venues.${venueId} has invalid weekday coverage`);
      continue;
    }
    for (let day = 0; day < 7; day += 1) {
      validateIntervals(weekdays[String(day)], `${path}.venues.${venueId}.${day}`, errors);
    }
  }
}

function validateCafeEastPayload(value, path, errors) {
  if (!exact(value, ['id', 'name', 'location', 'weekdays'])
    || value.id !== 'cafe-east' || value.name !== 'Café East'
    || value.location !== 'Lerner Hall, Room 2E'
    || !exact(value.weekdays, ['0', '1', '2', '3', '4', '5', '6'])) {
    errors.push(`${path} has invalid Café East metadata`);
    return;
  }
  for (let day = 0; day < 7; day += 1) {
    validateIntervals(value.weekdays[String(day)], `${path}.weekdays.${day}`, errors, { increasing: true });
  }
}

const BARNARD_VENUE_CONTRACT = Object.freeze([
  Object.freeze({ id: 'hewitt', name: 'Hewitt Dining', category: 'dining' }),
  Object.freeze({ id: 'diana-center-cafe', name: 'Diana Center Cafe', category: 'dining' }),
  Object.freeze({ id: 'barnard-bubble-tea-sushi', name: 'Bubble Tea & Sushi', category: 'dining' }),
  Object.freeze({ id: 'lizs-place', name: "Liz's Place", category: 'cafe' }),
]);

function validateBarnardPayload(value, path, errors) {
  if (!exact(value, ['windowStart', 'windowEnd', 'venues']) || !validDate(value.windowStart)) {
    errors.push(`${path} has invalid Barnard metadata`);
    return;
  }
  const dayCount = value.windowEnd === addDays(value.windowStart, 13) ? 14
    : value.windowEnd === addDays(value.windowStart, 20) ? 21 : 0;
  const weekStart = new Date(`${value.windowStart}T12:00:00Z`);
  if (!dayCount || weekStart.getUTCDay() !== 0) {
    errors.push(`${path} must contain two or three complete Sunday weeks`);
  }
  if (!Array.isArray(value.venues) || value.venues.length !== BARNARD_VENUE_CONTRACT.length) {
    errors.push(`${path}.venues must contain four Barnard venues`);
    return;
  }
  value.venues.forEach((venue, venueIndex) => {
    const venuePath = `${path}.venues[${venueIndex}]`;
    const contract = BARNARD_VENUE_CONTRACT[venueIndex];
    if (!exact(venue, ['id', 'name', 'category', 'days']) || venue.id !== contract.id
      || venue.name !== contract.name || venue.category !== contract.category) {
      errors.push(`${venuePath} has invalid Barnard identity`);
      return;
    }
    if (!Array.isArray(venue.days) || venue.days.length !== dayCount) {
      errors.push(`${venuePath}.days must match Barnard coverage`);
      return;
    }
    venue.days.forEach((day, dayIndex) => {
      const dayPath = `${venuePath}.days[${dayIndex}]`;
      if (!exact(day, ['date', 'intervals', 'status'])
        || day.date !== addDays(value.windowStart, dayIndex)
        || ![null, 'Closed'].includes(day.status)) {
        errors.push(`${dayPath} is invalid`);
        return;
      }
      validateIntervals(day.intervals, `${dayPath}.intervals`, errors);
      if (day.status === 'Closed' && day.intervals.length) {
        errors.push(`${dayPath} closed evidence cannot contain intervals`);
      }
      if (day.status === null && !day.intervals.length) {
        errors.push(`${dayPath} open evidence must contain intervals`);
      }
    });
  });
}

function validatePayload(sourceId, payload, batch, path, errors) {
  if (sourceId === 'locations-feed') validateLocationsPayload(payload, batch, path, errors);
  else if (sourceId === 'nsop-2026') validateNsopPayload(payload, path, errors);
  else if (sourceId === 'labor-day-2026') validateLaborPayload(payload, path, errors);
  else if (sourceId === 'fall-2026') validateFallPayload(payload, path, errors);
  else if (sourceId === 'cafe-east') validateCafeEastPayload(payload, path, errors);
  else if (sourceId === 'barnard-hours') validateBarnardPayload(payload, path, errors);
}

function contractForBatch(schemaVersion) {
  if (schemaVersion === 2) return DINING_SOURCE_CONTRACT_V3;
  if (schemaVersion === 3) return DINING_SOURCE_CONTRACT;
  return null;
}

export function validateDiningAttemptBatch(value) {
  const errors = [];
  if (!exact(value, ['schemaVersion', 'generated', 'windowStart', 'windowEnd', 'attempts'])) {
    return { ok: false, errors: ['attempt batch has unexpected fields'] };
  }
  const sourceContract = contractForBatch(value.schemaVersion);
  const sourceIds = sourceContract ? Object.keys(sourceContract) : [];
  if (!sourceContract) errors.push('schemaVersion must be 2 or 3');
  if (!validTimestamp(value.generated)) errors.push('generated must be timezone-aware');
  if (!validDate(value.windowStart) || value.windowEnd !== addDays(value.windowStart, 13)) {
    errors.push('batch window must contain fourteen dates');
  }
  if (!Array.isArray(value.attempts) || value.attempts.length !== sourceIds.length) {
    errors.push(`attempts must contain ${sourceIds.length || 'a supported set of'} sources`);
  } else {
    value.attempts.forEach((attempt, index) => {
      const path = `attempts[${index}]`;
      if (!exact(attempt, [
        'sourceId', 'sourceUrl', 'attemptedAt', 'result', 'failureCode', 'payload',
      ])) {
        errors.push(`${path} has unexpected fields`);
        return;
      }
      const sourceId = sourceIds[index];
      if (attempt.sourceId !== sourceId || attempt.sourceUrl !== sourceContract[sourceId]) {
        errors.push(`${path} source identity is invalid`);
      }
      if (!validTimestamp(attempt.attemptedAt) || attempt.attemptedAt !== value.generated) {
        errors.push(`${path}.attemptedAt must equal generated`);
      }
      if (attempt.result === 'success') {
        if (attempt.failureCode !== null || !record(attempt.payload)) {
          errors.push(`${path} success must contain payload evidence and no failure code`);
        } else validatePayload(sourceId, attempt.payload, value, `${path}.payload`, errors);
      } else if (attempt.result === 'failure') {
        if (!DINING_FAILURE_CODES.includes(attempt.failureCode) || attempt.payload !== null) {
          errors.push(`${path} failure must use a bounded failure code and null payload`);
        }
      } else errors.push(`${path}.result is invalid`);
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateDiningSourceState(value) {
  const errors = [];
  if (!exact(value, ['kind', 'schemaVersion', 'generated', 'sources', 'snapshot'])) {
    return { ok: false, errors: ['source state has unexpected fields'] };
  }
  const sourceIds = value.schemaVersion === 1 ? LEGACY_DINING_SOURCE_IDS
    : value.schemaVersion === 2 ? DINING_SOURCE_IDS_V3 : DINING_SOURCE_IDS;
  const sourceContract = value.schemaVersion === 1 ? LEGACY_DINING_SOURCE_CONTRACT
    : value.schemaVersion === 2 ? DINING_SOURCE_CONTRACT_V3 : DINING_SOURCE_CONTRACT;
  if (value.kind !== 'dining-source-state' || ![1, 2, 3].includes(value.schemaVersion)
    || !validTimestamp(value.generated)) errors.push('source state metadata is invalid');
  if (!Array.isArray(value.sources) || value.sources.length !== sourceIds.length) {
    errors.push(`source state must contain ${sourceIds.length} sources`);
  } else {
    value.sources.forEach((source, index) => {
      const path = `sources[${index}]`;
      if (!exact(source, [
        'sourceId', 'sourceUrl', 'lastAttemptAt', 'lastAttemptResult',
        'failureCode', 'lastSuccessAt', 'payload',
      ])) {
        errors.push(`${path} has unexpected fields`);
        return;
      }
      const sourceId = sourceIds[index];
      if (source.sourceId !== sourceId || source.sourceUrl !== sourceContract[sourceId]) {
        errors.push(`${path} source identity is invalid`);
      }
      if (!validTimestamp(source.lastAttemptAt)
        || !['success', 'failure'].includes(source.lastAttemptResult)) {
        errors.push(`${path} attempt metadata is invalid`);
      }
      if (source.lastAttemptResult === 'success' && source.failureCode !== null) {
        errors.push(`${path} successful attempt cannot have a failure code`);
      }
      if (source.lastAttemptResult === 'failure' && !DINING_FAILURE_CODES.includes(source.failureCode)) {
        errors.push(`${path} failure code is invalid`);
      }
      if (source.lastSuccessAt === null) {
        if (source.payload !== null) errors.push(`${path} uninitialized source cannot contain payload`);
      } else if (!validTimestamp(source.lastSuccessAt) || !record(source.payload)) {
        errors.push(`${path} retained success is invalid`);
      } else {
        const batch = sourceId === 'locations-feed' ? {
          generated: source.lastSuccessAt,
          windowStart: source.payload.windowStart,
          windowEnd: source.payload.windowEnd,
        } : null;
        validatePayload(sourceId, source.payload, batch, `${path}.payload`, errors);
      }
    });
  }
  if (value.snapshot !== null) {
    const validation = validateDiningHoursSnapshot(value.snapshot);
    if (!validation.ok) errors.push(...validation.errors.map(error => `snapshot: ${error}`));
    if (value.snapshot.schemaVersion === 4) {
      const stateById = new Map(value.sources.map(source => [source.sourceId, source]));
      for (const source of value.snapshot.sources) {
        if (source.fetchedAt !== stateById.get(source.id)?.lastSuccessAt) {
          errors.push(`snapshot: ${source.id}.fetchedAt must equal retained lastSuccessAt`);
        }
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
