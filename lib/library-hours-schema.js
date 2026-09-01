export const SCRAPER_TO_VENUE_ID = Object.freeze({
  butler_24: 'butler',
  science_engineering: 'noco',
  lehman: 'lehman',
  business: 'uris',
  avery: 'avery',
  math: 'math',
  barnard: 'milstein',
});

export const REQUIRED_LIBRARY_IDS = Object.freeze(Object.keys(SCRAPER_TO_VENUE_ID));

const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMBEDDED_FALLBACK_IDS = new Set(['lehman', 'business']);
const EMBEDDED_FALLBACK_REASON = 'unapproved-overnight-hours';
const BARNARD_PRIMARY_URL = 'https://hours.library.columbia.edu/locations/barnard';
const BARNARD_HOLIDAY_URL = 'https://library.barnard.edu/visit/hours';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function easternDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateHours(hours, path, libraryId, errors) {
  if (!isRecord(hours) || Object.keys(hours).length !== 7) {
    errors.push(`${path} must contain days 0 through 6`);
    return;
  }
  for (let day = 0; day < 7; day += 1) {
    const value = hours[String(day)];
    if (value === null) continue;
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'close,open') {
      errors.push(`${path}.${day} must be null or an hours object`);
      continue;
    }
    if (!OPEN_TIME.test(value.open || '') || !CLOSE_TIME.test(value.close || '')) {
      errors.push(`${path}.${day} times must use HH:MM`);
    } else if (libraryId !== 'butler_24' && value.close <= value.open) {
      const error = `${libraryId}: overnight hours are not allowed`;
      if (!errors.includes(error)) errors.push(error);
    }
  }
}

export function validateLibraryHoursSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['snapshot must be an object'] };
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const generatedTimestamp = Date.parse(value.generated);
  if (Number.isNaN(generatedTimestamp) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.generated || '')) {
    errors.push('generated must be a timezone-aware ISO timestamp');
  }
  if (!Array.isArray(value.libraries)) {
    errors.push('libraries must be an array');
    return { ok: false, errors };
  }

  const seen = new Set();
  const generatedDate = Number.isNaN(generatedTimestamp) ? null : easternDate(value.generated);
  for (const [index, library] of value.libraries.entries()) {
    const path = `libraries[${index}]`;
    if (!isRecord(library)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (typeof library.id !== 'string' || seen.has(library.id)) errors.push(`${path}.id must be unique`);
    seen.add(library.id);
    try {
      const source = new URL(library.url);
      if (source.protocol !== 'https:' || source.hostname !== 'hours.library.columbia.edu'
        || !source.pathname.startsWith('/locations/')) {
        errors.push(`${path}.url must use hours.library.columbia.edu`);
      }
    } catch {
      errors.push(`${path}.url must use hours.library.columbia.edu`);
    }
    if (library.id === 'barnard') {
      if (library.url !== BARNARD_PRIMARY_URL) errors.push(`${path}.url must use the Barnard Columbia hours page`);
      if (library.holidayUrl !== BARNARD_HOLIDAY_URL) errors.push(`${path}.holidayUrl must use Barnard Library's hours page`);
    } else if ('holidayUrl' in library) {
      errors.push(`${path}: only barnard may use holidayUrl`);
    }
    if (library.scrapeFailed === true) errors.push(`${library.id}: scrape failed`);
    if (typeof library.temporarilyClosed !== 'boolean') {
      errors.push(`${path}.temporarilyClosed must be boolean`);
    }
    const useEmbeddedFallback = library.useEmbeddedFallback ?? false;
    if (typeof useEmbeddedFallback !== 'boolean') {
      errors.push(`${path}.useEmbeddedFallback must be boolean`);
    }
    if (useEmbeddedFallback === true) {
      if (!EMBEDDED_FALLBACK_IDS.has(library.id)) {
        errors.push(`${library.id}: embedded fallback is not allowed`);
      }
      if (library.fallbackReason !== EMBEDDED_FALLBACK_REASON) {
        errors.push(`${library.id}: invalid fallback reason`);
      }
      if (library.temporarilyClosed !== false) {
        errors.push(`${library.id}: fallback cannot be temporarily closed`);
      }
      if (!Array.isArray(library.schedules) || library.schedules.length !== 0) {
        errors.push(`${library.id}: fallback schedules must be empty`);
      }
      continue;
    }
    if ('fallbackReason' in library) {
      errors.push(`${library.id}: fallback reason requires embedded fallback`);
    }
    if (!Array.isArray(library.schedules) || library.schedules.length === 0) {
      errors.push(`${path}.schedules must be a non-empty array`);
      continue;
    }
    let activeSchedule = null;
    for (const [scheduleIndex, schedule] of library.schedules.entries()) {
      const schedulePath = `${path}.schedules[${scheduleIndex}]`;
      if (!isRecord(schedule) || !ISO_DATE.test(schedule.start || '') || !ISO_DATE.test(schedule.end || '')) {
        errors.push(`${schedulePath} must have ISO start and end dates`);
        continue;
      }
      validateHours(schedule.hours, `${schedulePath}.hours`, library.id, errors);
      if (generatedDate && schedule.start <= generatedDate && generatedDate <= schedule.end) {
        activeSchedule = schedule;
      }
    }
    if (!activeSchedule) {
      errors.push(`${library.id}: no schedule covers generated date`);
    } else if (library.temporarilyClosed && Object.values(activeSchedule.hours).some(Boolean)) {
      errors.push(`${library.id}: temporarily closed schedule must contain only closed days`);
    }
  }
  for (const id of REQUIRED_LIBRARY_IDS) {
    if (!seen.has(id)) errors.push(`missing required library: ${id}`);
  }
  for (const id of seen) {
    if (!REQUIRED_LIBRARY_IDS.includes(id)) errors.push(`unexpected library: ${id}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
