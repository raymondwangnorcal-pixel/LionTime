export const DINING_SOURCE_URL = 'https://dining.columbia.edu/content/locations-hours';

export const DINING_LOCATION_CONTRACT = Object.freeze({
  7482: Object.freeze({ id: 'bj-everett', category: 'cafe' }),
  56: Object.freeze({ id: 'bj-butler', category: 'cafe' }),
  60: Object.freeze({ id: 'bj-uris', category: 'cafe' }),
  57: Object.freeze({ id: 'bj-mudd', category: 'cafe' }),
  6990: Object.freeze({ id: 'chefdons', category: 'dining' }),
  6907: Object.freeze({ id: 'chefmikes', category: 'dining' }),
  7351: Object.freeze({ id: 'facultyhouse', category: 'dining' }),
  7850: Object.freeze({ id: 'facultyhouse-4', category: 'dining' }),
  12: Object.freeze({ id: 'ferris', category: 'dining' }),
  7355: Object.freeze({ id: 'gracedodge', category: 'dining' }),
  11: Object.freeze({ id: 'jjs', category: 'dining' }),
  10: Object.freeze({ id: 'johnjay', category: 'dining' }),
  9727: Object.freeze({ id: 'johnnys', category: 'dining' }),
  58: Object.freeze({ id: 'lenfest-cafe', category: 'cafe' }),
  7452: Object.freeze({ id: 'smith-dining', category: 'dining' }),
  7487: Object.freeze({ id: 'facshack', category: 'dining' }),
});

const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function easternDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function validateIntervals(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  let priorEnd = -1;
  for (const [index, interval] of value.entries()) {
    const intervalPath = `${path}[${index}]`;
    if (!Array.isArray(interval) || interval.length !== 2
      || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) {
      errors.push(`${intervalPath} times must use HH:MM`);
      continue;
    }
    const start = minutes(interval[0]);
    let end = interval[1] === '24:00' ? 1440 : minutes(interval[1]);
    if (end <= start) end += 1440;
    if (start < priorEnd) errors.push(`${path} intervals must not overlap`);
    priorEnd = end;
  }
}

export function validateDiningHoursSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['snapshot must be an object'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (value.source !== DINING_SOURCE_URL) errors.push('source must be the official Columbia Dining URL');
  if (!ISO_DATE.test(value.windowStart || '') || !ISO_DATE.test(value.windowEnd || '')) {
    errors.push('windowStart and windowEnd must use ISO dates');
  }
  const expectedEnd = ISO_DATE.test(value.windowStart || '') ? addDays(value.windowStart, 13) : null;
  if (expectedEnd && value.windowEnd !== expectedEnd) errors.push('windowEnd must complete fourteen consecutive dates');
  const generatedDate = easternDate(value.generated);
  if (!generatedDate || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.generated || '')) {
    errors.push('generated must be a timezone-aware ISO timestamp');
  } else if (generatedDate !== value.windowStart) {
    errors.push('generated Eastern date must equal windowStart');
  }
  if (!Array.isArray(value.locations)) {
    errors.push('locations must be an array');
    return { ok: false, errors };
  }

  const contractById = new Map(Object.entries(DINING_LOCATION_CONTRACT)
    .map(([sourceId, contract]) => [contract.id, { sourceId, ...contract }]));
  const seenIds = new Set();
  const seenSources = new Set();
  for (const [index, location] of value.locations.entries()) {
    const path = `locations[${index}]`;
    if (!isRecord(location)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (typeof location.id !== 'string' || seenIds.has(location.id)) {
      errors.push(`${path}.id must be unique`);
    }
    seenIds.add(location.id);
    if (typeof location.sourceId !== 'string' || seenSources.has(location.sourceId)) {
      errors.push(`${path}.sourceId must be unique`);
    }
    seenSources.add(location.sourceId);
    const contract = contractById.get(location.id);
    if (!contract) {
      errors.push(`unexpected location: ${location.id}`);
    } else {
      if (location.sourceId !== contract.sourceId) errors.push(`${location.id}: unexpected source ID`);
      if (location.category !== contract.category) errors.push(`${location.id}: category does not match contract`);
    }
    if (typeof location.name !== 'string' || !location.name.trim() || location.name.length > 120
      || /[<>\u0000-\u001f]/.test(location.name)) {
      errors.push(`${path}.name must be bounded plain text`);
    }
    if (!Array.isArray(location.days) || location.days.length !== 14) {
      errors.push(`${path}.days must contain fourteen consecutive dates`);
      continue;
    }
    for (let dayIndex = 0; dayIndex < 14; dayIndex += 1) {
      const day = location.days[dayIndex];
      const dayPath = `${path}.days[${dayIndex}]`;
      if (!isRecord(day)) {
        errors.push(`${dayPath} must be an object`);
        continue;
      }
      const expectedDate = addDays(value.windowStart, dayIndex);
      if (day.date !== expectedDate) errors.push(`${dayPath}.date must be ${expectedDate}`);
      validateIntervals(day.intervals, `${dayPath}.intervals`, errors);
      if (day.status !== null && (typeof day.status !== 'string' || day.status.length > 160
        || /[<>\u0000-\u001f]/.test(day.status))) {
        errors.push(`${dayPath}.status must be null or bounded plain text`);
      }
    }
  }

  for (const { id } of Object.values(DINING_LOCATION_CONTRACT)) {
    if (!seenIds.has(id)) errors.push(`missing required location: ${id}`);
  }
  for (const sourceId of Object.keys(DINING_LOCATION_CONTRACT)) {
    if (!seenSources.has(sourceId)) errors.push(`missing required source: ${sourceId}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
