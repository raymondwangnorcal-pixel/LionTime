const SOURCE_URL = 'https://dining.columbia.edu/content/locations-hours';

export const DINING_LOCATION_MAP = Object.freeze({
  7482: Object.freeze({ id: 'bj-everett', name: 'Blue Java at Everett Library Café', category: 'cafe' }),
  56: Object.freeze({ id: 'bj-butler', name: 'Blue Java Café - Butler Library', category: 'cafe' }),
  60: Object.freeze({ id: 'bj-uris', name: 'Blue Java Café - Uris', category: 'cafe' }),
  57: Object.freeze({ id: 'bj-mudd', name: "Blue Java Café at Chef Don's, Mudd Hall", category: 'cafe' }),
  6990: Object.freeze({ id: 'chefdons', name: "Chef Don's Pizza Pi featuring Blue Java", category: 'dining' }),
  6907: Object.freeze({ id: 'chefmikes', name: "Chef Mike's Sub Shop", category: 'dining' }),
  7351: Object.freeze({ id: 'facultyhouse', name: 'Faculty House 2nd Floor', category: 'dining' }),
  7850: Object.freeze({ id: 'facultyhouse-4', name: 'Faculty House 4th Floor', category: 'dining' }),
  12: Object.freeze({ id: 'ferris', name: 'Ferris Booth Commons', category: 'dining' }),
  7355: Object.freeze({ id: 'gracedodge', name: 'Grace Dodge Dining Hall', category: 'dining' }),
  11: Object.freeze({ id: 'jjs', name: "JJ's Place", category: 'dining' }),
  10: Object.freeze({ id: 'johnjay', name: 'John Jay Dining Hall', category: 'dining' }),
  9727: Object.freeze({ id: 'johnnys', name: "Johnny's Food Truck", category: 'dining' }),
  58: Object.freeze({ id: 'lenfest-cafe', name: 'Lenfest Café', category: 'cafe' }),
  7452: Object.freeze({ id: 'smith-dining', name: 'Robert F. Smith Dining Hall', category: 'dining' }),
  7487: Object.freeze({ id: 'facshack', name: 'The Fac Shack', category: 'dining' }),
});

const DAY_KEYS = Object.freeze([
  'days_sunday',
  'days_monday',
  'days_tuesday',
  'days_wednesday',
  'days_thursday',
  'days_friday',
  'days_saturday',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function sourceDate(value, field) {
  if (typeof value === 'number' && Number.isFinite(value)) return easternDate(new Date(value * 1000));
  if (typeof value === 'string' && /^\d+$/.test(value)) return easternDate(new Date(Number(value) * 1000));
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error(`invalid ${field}`);
}

function cleanStatus(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function normalizeTime(value, allow24 = false) {
  const raw = String(value ?? '').trim();
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (minute < 60 && (hour < 24 || (allow24 && hour === 24 && minute === 0))) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const twelve = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2] || 0);
    if (hour >= 1 && hour <= 12 && minute < 60) {
      const normalized = (hour % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0);
      return `${String(normalized).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  throw new Error(`invalid dining time: ${raw}`);
}

function normalizeExcluded(value) {
  if (!Array.isArray(value)) return new Set();
  const dates = value.map((item) => {
    const raw = typeof item === 'string' ? item : item?.date || item?.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw || '')) return raw;
    const match = String(raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error(`invalid excluded date: ${raw}`);
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  });
  return new Set(dates);
}

function findLocationNodes(dataset) {
  const found = [];
  const visited = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (isRecord(value) && ('nid' in value || 'id' in value)
      && ('open_hours_fields' in value || 'openHoursFields' in value)) {
      found.push(value);
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(dataset);
  return found;
}

function periodsFor(node) {
  const value = node.open_hours_fields ?? node.openHoursFields;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error(`source location ${node.nid ?? node.id} has invalid hours periods`);
}

function intervalsFor(period, date) {
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  const values = period.days?.[DAY_KEYS[dayIndex]] ?? [];
  if (!Array.isArray(values)) throw new Error(`invalid intervals for ${date}`);
  return values.map((interval) => {
    if (!isRecord(interval)) throw new Error(`invalid interval for ${date}`);
    return [
      normalizeTime(interval.hours_from ?? interval.from ?? interval.open),
      normalizeTime(interval.hours_to ?? interval.to ?? interval.close, true),
    ];
  });
}

function periodForDate(periods, date) {
  return periods.find((period) => {
    if (!isRecord(period)) return false;
    const start = sourceDate(period.date_from ?? period.dateFrom, 'date_from');
    const end = sourceDate(period.date_to ?? period.dateTo, 'date_to');
    return start <= date && date <= end;
  });
}

export function parseDiningNodes(raw) {
  if (typeof raw !== 'string') throw new Error('dining_nodes must be a JSON string');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('dining_nodes must contain valid JSON');
  }
}

export function buildDiningSnapshot(dataset, generated = new Date()) {
  if (!(generated instanceof Date) || Number.isNaN(generated.getTime())) {
    throw new Error('generated must be a valid Date');
  }
  const sourceNodes = findLocationNodes(dataset);
  const bySourceId = new Map(sourceNodes.map((node) => [String(node.nid ?? node.id), node]));
  const windowStart = easternDate(generated);
  const dates = Array.from({ length: 14 }, (_, index) => addDays(windowStart, index));

  const locations = Object.entries(DINING_LOCATION_MAP).map(([sourceId, mapping]) => {
    const node = bySourceId.get(sourceId);
    if (!node) throw new Error(`missing source location: ${sourceId}`);
    const periods = periodsFor(node);
    const days = dates.map((date) => {
      const period = periodForDate(periods, date);
      if (!period) return { date, intervals: [], status: 'Hours not published' };
      const status = cleanStatus(period.displayed_hours ?? period.displayedHours);
      const excluded = normalizeExcluded(period.excluded ?? period.excluded_dates ?? period.excludedDates);
      return {
        date,
        intervals: excluded.has(date) ? [] : intervalsFor(period, date),
        status,
      };
    });
    return {
      id: mapping.id,
      sourceId,
      name: String(node.title || node.name || mapping.name).trim(),
      category: mapping.category,
      days,
    };
  });

  return {
    schemaVersion: 1,
    generated: generated.toISOString(),
    source: SOURCE_URL,
    windowStart,
    windowEnd: dates.at(-1),
    locations,
  };
}

export { SOURCE_URL };
