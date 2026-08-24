export const BARNARD_DINING_SOURCE_URL = 'https://dineoncampus.com/barnard/hours-of-operation';

export const BARNARD_DINING_VENUE_CONTRACT = Object.freeze([
  Object.freeze({ id: 'hewitt', name: 'Hewitt Dining', category: 'dining' }),
  Object.freeze({ id: 'diana-center-cafe', name: 'Diana Center Cafe', category: 'dining' }),
  Object.freeze({ id: 'barnard-bubble-tea-sushi', name: 'Bubble Tea & Sushi', category: 'dining' }),
  Object.freeze({ id: 'lizs-place', name: "Liz's Place", category: 'cafe' }),
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

function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value, count) {
  if (!validDate(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function minutes(value) {
  return value === '24:00' ? 1440 : Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function validateIntervals(value, path, errors) {
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
    if (end <= start) end += 1440;
    if (start < priorEnd) errors.push(`${path} must not overlap`);
    priorEnd = end;
  });
}

export function validateBarnardDiningHoursSnapshot(value) {
  const errors = [];
  if (!exact(value, [
    'schemaVersion', 'generated', 'source', 'windowStart', 'windowEnd', 'venues',
  ])) return { ok: false, errors: ['Barnard Dining snapshot has unexpected fields'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof value.generated !== 'string' || !AWARE_TIMESTAMP.test(value.generated)
    || Number.isNaN(Date.parse(value.generated))) errors.push('generated must be timezone-aware');
  if (value.source !== BARNARD_DINING_SOURCE_URL) errors.push('source must be the official Barnard Dining URL');

  const dayCount = value.windowEnd === addDays(value.windowStart, 13) ? 14
    : value.windowEnd === addDays(value.windowStart, 20) ? 21 : 0;
  const weekStart = validDate(value.windowStart) ? new Date(`${value.windowStart}T12:00:00Z`) : null;
  if (!dayCount || weekStart?.getUTCDay() !== 0) {
    errors.push('snapshot must contain two or three complete Sunday weeks');
  }

  if (!Array.isArray(value.venues) || value.venues.length !== BARNARD_DINING_VENUE_CONTRACT.length) {
    errors.push('venues must contain four Barnard Dining venues');
  } else {
    value.venues.forEach((venue, venueIndex) => {
      const path = `venues[${venueIndex}]`;
      const contract = BARNARD_DINING_VENUE_CONTRACT[venueIndex];
      if (!exact(venue, ['id', 'name', 'category', 'days'])
        || venue.id !== contract.id || venue.name !== contract.name
        || venue.category !== contract.category) {
        errors.push(`${path} identity is invalid`);
        return;
      }
      if (!Array.isArray(venue.days) || venue.days.length !== dayCount) {
        errors.push(`${path}.days must match source coverage`);
        return;
      }
      venue.days.forEach((day, dayIndex) => {
        const dayPath = `${path}.days[${dayIndex}]`;
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

  return errors.length ? { ok: false, errors } : { ok: true, value };
}
